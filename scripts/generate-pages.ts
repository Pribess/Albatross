const outputDir = "pages";
const outputPath = `${outputDir}/index.html`;

const rawUrl = "https://raw.githubusercontent.com/Pribess/Albatross/build-assets/main.js";

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Albatross Loader</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      background: #f4f6fb;
      color: #111827;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
    }
    p {
      margin: 0 0 18px;
      color: #4b5563;
      line-height: 1.5;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0 0 10px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      background: #111827;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
    }
    .status {
      font-size: 13px;
      color: #6b7280;
    }
    pre {
      margin: 0;
      border-radius: 12px;
      padding: 16px;
      background: #0f172a;
      color: #e5e7eb;
      overflow-x: auto;
      border: 1px solid #1f2937;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <h1>Albatross Console Loader</h1>
    <p>아래 코드는 <code>raw.githubusercontent.com</code>의 최신 빌드를 불러와 표시합니다.</p>
    <div class="toolbar">
      <button id="copy" class="button" type="button">Copy Code</button>
      <button id="reload" class="button" type="button">Reload</button>
      <span id="status" class="status">Ready</span>
    </div>
    <pre><code id="code">Loading...</code></pre>
  </main>

  <script>
    const rawUrl = ${JSON.stringify(rawUrl)};
    const codeEl = document.getElementById("code");
    const copyButton = document.getElementById("copy");
    const reloadButton = document.getElementById("reload");
    const status = document.getElementById("status");
    let latestCode = "";

    async function loadLatestCode() {
      status.innerText = "Loading...";
      codeEl.innerText = "Loading...";

      try {
        const response = await fetch(rawUrl + "?t=" + Date.now(), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Failed: " + response.status);
        }

        latestCode = await response.text();

        if (!latestCode.trim()) {
          throw new Error("Empty build output");
        }

        codeEl.innerText = latestCode;
        status.innerText = "Latest build loaded";
      } catch (error) {
        latestCode = "";
        codeEl.innerText = "Failed to load latest build.";
        status.innerText = error?.message || "Load failed";
      }
    }

    copyButton.addEventListener("click", async () => {
      if (!latestCode) {
        status.innerText = "No code loaded";
        return;
      }

      try {
        await navigator.clipboard.writeText(latestCode);
        status.innerText = "Copied";
      } catch {
        status.innerText = "Clipboard blocked - copy manually";
      }
    });

    reloadButton.addEventListener("click", () => {
      void loadLatestCode();
    });

    void loadLatestCode();
  </script>
</body>
</html>
`;

await Bun.$`mkdir -p ${outputDir}`;
await Bun.write(outputPath, html);
