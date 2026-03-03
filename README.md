# Albatross

서강대 수강신청 매크로

## Build

```bash
bun install
bun run build
```

## Browser Console에서 바로 실행

아래 스크립트를 브라우저 개발자도구 Console에 붙여넣으면,
Actions가 Release(`build-latest`)에 업로드한 `main.js`를 가져와 즉시 실행합니다.

```js
(() => {
  const owner = "Pribess";
  const repo = "Albatross";
  const tag = "build-latest";
  const assetName = "main.js";

  fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((releaseResponse) => {
      if (!releaseResponse.ok) {
        throw new Error(`Release lookup failed: ${releaseResponse.status}`);
      }
      return releaseResponse.json();
    })
    .then((release) => {
      const asset = release.assets?.find((item) => item.name === assetName);
      if (!asset) {
        throw new Error(`Asset not found: ${assetName}`);
      }

      return fetch(
        `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`,
        {
          cache: "no-store",
          headers: { Accept: "application/octet-stream" },
        },
      );
    })
    .then((assetResponse) => {
      if (!assetResponse.ok) {
        throw new Error(`Asset download failed: ${assetResponse.status}`);
      }
      return assetResponse.text();
    })
    .then((code) => {
      (0, eval)(code);
    })
    .catch((error) => {
      console.error("[Albatross] load failed", error);
    });
})();
```

## Commands

- `bun run format`
- `bun run lint`
- `bun run build`
- `bun run check`
