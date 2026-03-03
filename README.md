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

## CORS가 걸릴 때 (사용자가 직접 허용/우회)

아래 방법은 **개인 테스트용**입니다.

1. 브라우저 확장 사용 (가장 쉬움)

- Chrome/Edge: CORS 관련 확장을 켜고 해당 사이트에서만 허용
- Firefox: CORS 관련 확장을 켜고 필요한 도메인만 허용

2. CORS 비활성 전용 브라우저 프로필로 실행 (개발용)

macOS:

```bash
open -na "Google Chrome" --args --user-data-dir=/tmp/chrome-no-cors --disable-web-security
```

종료 후 해당 창은 반드시 닫으세요.

3. 로컬 프록시 사용 (안전한 개발 흐름)

```bash
npx cors-anywhere
```

그리고 콘솔에서:

```js
(() => {
  const target = "https://github.com/Pribess/Albatross/releases/latest/download/main.js";
  const url = `http://localhost:8080/${target}`;

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

4. fetch 대신 script 태그 삽입 (CORS 회피에 유리)

```js
(() => {
  const script = document.createElement("script");
  script.src = "https://github.com/Pribess/Albatross/releases/latest/download/main.js";
  script.onload = () => console.log("[Albatross] loaded");
  script.onerror = () => console.error("[Albatross] script load failed");
  document.head.appendChild(script);
})();
```

## Commands

- `bun run format`
- `bun run lint`
- `bun run build`
- `bun run check`
