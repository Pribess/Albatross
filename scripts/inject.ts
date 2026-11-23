/**
 * Inject dist/main.js into a Chrome tab over CDP (Chrome DevTools Protocol).
 *
 * Usage:
 *   bun run scripts/inject.ts [url-substring]
 *
 * 1. Lists page targets from http://localhost:9222/json
 * 2. Picks the first page whose URL contains the substring (default: any real page)
 * 3. Destroys any previous overlay, then evaluates the built script
 *
 * Launch Chrome first:
 *   open -na "Google Chrome" --args --remote-debugging-port=9222 \
 *     --user-data-dir="$HOME/.albatross-chrome-profile" --no-first-run
 */

const DEBUG_HOST = process.env.ALBATROSS_CDP_HOST ?? "http://localhost:9222";
const DIST_PATH = new URL("../dist/main.js", import.meta.url).pathname;

type CdpTarget = {
  id: string;
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl?: string;
};

type CdpResponse = {
  id: number;
  result?: unknown;
  error?: { message: string };
};

const code = await Bun.file(DIST_PATH).text();
if (!code.trim()) {
  console.error("dist/main.js is empty — run `bun run build` first.");
  process.exit(1);
}

const targets = (await (await fetch(`${DEBUG_HOST}/json`)).json()) as CdpTarget[];
const pages = targets.filter((target) => target.type === "page" && target.webSocketDebuggerUrl);
if (pages.length === 0) {
  console.error("No injectable page targets. Open the target site in the debug Chrome first.");
  process.exit(1);
}

const filter = process.argv[2] ?? "";
const page =
  (filter && pages.find((candidate) => candidate.url.includes(filter))) ||
  pages.find((candidate) => !candidate.url.startsWith("chrome")) ||
  pages[0]!;

console.log(`Injecting into: ${page.title || "(untitled)"} <${page.url}>`);

const socket = new WebSocket(page.webSocketDebuggerUrl!);
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => resolve());
  socket.addEventListener("error", () => reject(new Error("WebSocket connect failed")));
});

let messageId = 0;
const pending = new Map<number, (response: CdpResponse) => void>();
socket.addEventListener("message", (event) => {
  const response = JSON.parse(String(event.data)) as CdpResponse;
  if (response.id !== undefined) {
    pending.get(response.id)?.(response);
    pending.delete(response.id);
  }
});

const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<CdpResponse>((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 10_000);
  });

await send("Runtime.enable");

// Remove a previous overlay instance so re-injection always reinstalls cleanly.
await send("Runtime.evaluate", {
  expression: "try { window.__ALBATROSS_CONTROLLER__?.destroy() } catch {}",
});

const evaluated = await send("Runtime.evaluate", {
  expression: code,
  awaitPromise: true,
  returnByValue: true,
});
socket.close();

if (evaluated.error) {
  console.error(`CDP error: ${evaluated.error.message}`);
  process.exit(1);
}
const details = (evaluated.result as { exceptionDetails?: unknown }).exceptionDetails;
if (details) {
  console.error("Injection raised an exception:", JSON.stringify(details, null, 2));
  process.exit(1);
}
console.log("Overlay injected. Look for the ALBATROSS panel in the top-right corner.");
