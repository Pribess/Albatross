/**
 * Read-only reconnaissance: hunt for a millisecond-precision server time source.
 *
 * Runs inside the target page (same-origin, with session cookies) over CDP:
 *   1. Lists recent XHR/fetch resource URLs the app actually calls
 *   2. Fetches the app manifest.json to find its OData service
 *   3. Probes standard SAP time-ish endpoints (GET only, small)
 *   4. Hooks XMLHttpRequest for ~25 s to capture one probe round's raw
 *      response headers + body (ms timestamps sometimes hide there)
 *
 * Usage: bun run scripts/explore-time.ts
 */

const DEBUG_HOST = process.env.ALBATROSS_CDP_HOST ?? "http://localhost:9222";
const FILTER = process.argv[2] ?? "sis109";

type CdpTarget = { id: string; type: string; url: string; webSocketDebuggerUrl?: string };
type CdpResponse = { id: number; result?: unknown; error?: { message: string } };

const targets = (await (await fetch(`${DEBUG_HOST}/json`)).json()) as CdpTarget[];
const page = targets.find(
  (target) => target.type === "page" && target.url.includes(FILTER) && target.webSocketDebuggerUrl,
);
if (!page) {
  console.error(`No page target matching "${FILTER}" — open the registration site first.`);
  process.exit(1);
}

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
const send = (method: string, params: Record<string, unknown> = {}, timeoutMs = 40_000) =>
  new Promise<CdpResponse>((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, timeoutMs);
  });

const inPageExpression = `
(async () => {
  const out = { resources: [], manifest: null, candidates: [], xhrCapture: [] };

  out.resources = performance.getEntriesByType("resource")
    .filter((e) => e.initiatorType === "xmlhttprequest" || e.initiatorType === "fetch")
    .map((e) => e.name)
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(-40);

  try {
    const res = await fetch("/zu4a/zcmuik101/manifest.json", { cache: "no-store" });
    out.manifest = (await res.text()).slice(0, 4000);
  } catch (error) {
    out.manifest = "ERR " + error;
  }

  const candidates = [
    "/sap/public/ping",
    "/sap/bc/ui2/start_up",
    "/sap/public/info",
  ];
  for (const path of candidates) {
    try {
      const started = performance.now();
      const res = await fetch(path, { cache: "no-store" });
      const body = await res.text();
      out.candidates.push({
        path,
        status: res.status,
        headers: Array.from(res.headers.entries()).filter(([key]) =>
          /date|server|sap|time/i.test(key),
        ),
        body: body.slice(0, 400),
        elapsedMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      out.candidates.push({ path, error: String(error) });
    }
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  window.__albatrossXhrLog = out.xhrCapture;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__url = String(url);
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("loadend", () => {
      try {
        if (out.xhrCapture.length >= 6) return;
        const headers = this.getAllResponseHeaders();
        if (!/zcmuik101|odata|sap\\/bc|time/i.test(this.__url + headers)) return;
        out.xhrCapture.push({
          url: this.__url,
          status: this.status,
          headers,
          body: (this.responseType === "" || this.responseType === "text")
            ? String(this.responseText).slice(0, 1200)
            : "(non-text response)",
        });
      } catch {}
    });
    return originalSend.apply(this, args);
  };

  await new Promise((resolve) => setTimeout(resolve, 25000));
  XMLHttpRequest.prototype.open = originalOpen;
  XMLHttpRequest.prototype.send = originalSend;

  return JSON.stringify(out, null, 1);
})()
`;

console.log("Collecting for ~25 s (waiting for one probe round)…");
const evaluated = await send("Runtime.evaluate", {
  expression: inPageExpression,
  awaitPromise: true,
  returnByValue: true,
});
socket.close();

const result = evaluated.result as { result?: { value?: string } } | undefined;
const payload = result?.result?.value;
if (!payload) {
  console.error("In-page script returned nothing:", JSON.stringify(evaluated, null, 2));
  process.exit(1);
}
await Bun.write("scripts/explore-time-output.json", payload);
console.log("Full output saved to scripts/explore-time-output.json\n");

const data = JSON.parse(payload) as {
  resources: string[];
  manifest: string | null;
  candidates: Array<{ path: string; status?: number; body?: string; headers?: unknown[] }>;
  xhrCapture: Array<{ url: string; status: number; headers: string; body: string }>;
};

console.log("== XHR/fetch resources the app calls ==");
for (const url of data.resources) console.log(" ", url);
console.log("\n== Candidate endpoints ==");
for (const candidate of data.candidates) {
  console.log(` ${candidate.path} → ${candidate.status ?? candidate.body}`);
  if (candidate.body) console.log(`   body: ${candidate.body.slice(0, 200).replace(/\n/g, " ")}`);
}
console.log("\n== Captured probe XHRs (headers + body) ==");
for (const capture of data.xhrCapture) {
  console.log(` [${capture.status}] ${capture.url}`);
  console.log(capture.headers.trim());
  console.log(` body: ${capture.body.slice(0, 300).replace(/\n/g, " ")}`);
  console.log(" ---");
}
if (data.manifest && data.manifest.startsWith("{")) {
  console.log("\n== Manifest data sources ==");
  const dataSourceMatch = data.manifest.match(/"uri"\s*:\s*"([^"]+)"/g);
  if (dataSourceMatch) console.log(dataSourceMatch.join("\n"));
}
