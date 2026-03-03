# Albatross

`src/main.ts`를 빌드해서 한 줄짜리 `dist/main.js`를 생성합니다.

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
  const url = "https://github.com/Pribess/Albatross/releases/latest/download/main.js";

  fetch(url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }
      return response.text();
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
