# Albatross

DOM 기반 서강대 수강신청 매크로입니다.

## 사용방법

먼저 아래 페이지를 여세요.

- 실행 페이지: [https://pribess.github.io/Albatross/](https://pribess.github.io/Albatross/)
- 실행 페이지와 수강신청 페이지를 각각 다른 탭으로 열어두세요.

그 다음 브라우저별로 아래 순서대로 진행하면 됩니다.

### Chrome

1. 수강신청 사이트 페이지를 켭니다.
2. 키보드에서 `F12`를 누릅니다. (Mac은 `Option + Command + J`)
3. 위쪽 탭에서 `Console`을 누릅니다. (Mac 단축키로 이미 Console이 열렸으면 생략)
4. 실행 페이지에서 `Copy` 버튼을 눌러 코드를 복사합니다.
5. 수강신청 사이트의 `Console` 입력줄에 붙여넣고 `Enter`를 누릅니다.

### Safari

Safari는 처음 1회 설정이 필요합니다.

1. Safari 상단 메뉴에서 `Safari > 설정 > 고급`으로 들어갑니다.
2. 맨 아래 `메뉴 막대에서 개발자용 메뉴 보기`를 체크합니다.
3. 수강신청 사이트 페이지를 켭니다.
4. 키보드에서 `Option + Command + C`를 누릅니다.
5. 하단/우측에 열린 개발자창에서 `Console` 탭을 누릅니다.
6. 실행 페이지에서 `Copy` 버튼을 눌러 코드를 복사합니다.
7. 수강신청 사이트의 `Console` 입력줄에 붙여넣고 `Enter`를 누릅니다.

## 시연 영상

- [output.mp4 보기](./demo/output.mp4)

## Build

- 빌드: `bun run build`

## Commands

- `bun run format`
- `bun run lint`
- `bun run build`
- `bun run check`

## Disclaimer

이 프로젝트 사용으로 인해 발생하는 모든 결과(계정 제재, 수강신청 실패, 데이터 손실, 기타 직/간접적 피해 포함)에 대한 책임은 전적으로 사용자에게 있으며, 개발자는 이에 대해 어떠한 법적/재정적 책임도 지지 않습니다.
