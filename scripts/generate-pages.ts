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
      padding: 14px 20px;
      background: #111827;
      color: #fff;
      cursor: pointer;
      font-weight: 600;
      font-size: 15px;
      min-width: 110px;
      transition: background-color 0.2s ease;
    }
    .button.copied {
      background: #16a34a;
    }
    .button.reloaded {
      background: #2563eb;
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
      <button id="copy" class="button" type="button">Copy</button>
      <button id="reload" class="button" type="button">Reload</button>
    </div>
    <pre><code id="code">Loading...</code></pre>
  </main>

  <script>
    const rawUrl = ${JSON.stringify(rawUrl)};
    const codeEl = document.getElementById("code");
    const copyButton = document.getElementById("copy");
    const reloadButton = document.getElementById("reload");
    let latestCode = "";
    let copiedTimer = 0;
    let reloadedTimer = 0;

    async function loadLatestCode() {
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
      } catch (error) {
        latestCode = "";
        codeEl.innerText = "Failed to load latest build.";
        console.error(error);
      }
    }

    copyButton.addEventListener("click", async () => {
      copyButton.classList.add("copied");

      if (copiedTimer) {
        clearTimeout(copiedTimer);
      }

      copiedTimer = window.setTimeout(() => {
        copyButton.classList.remove("copied");
        copiedTimer = 0;
      }, 1200);

      if (!latestCode) {
        return;
      }

      try {
        await navigator.clipboard.writeText(latestCode);
      } catch {
        console.error("Clipboard blocked - copy manually");
      }
    });

    reloadButton.addEventListener("click", () => {
      reloadButton.classList.add("reloaded");

      if (reloadedTimer) {
        clearTimeout(reloadedTimer);
      }

      reloadedTimer = window.setTimeout(() => {
        reloadButton.classList.remove("reloaded");
        reloadedTimer = 0;
      }, 1200);

      void loadLatestCode();
    });

    void loadLatestCode();
  </script>
</body>
</html>
`;

await Bun.$`mkdir -p ${outputDir}`;
await Bun.write(outputPath, html);
