# Albatross

DOM 기반 서강대 수강신청 매크로입니다.

## 사용방법

먼저 아래 페이지를 여세요.

- 실행 페이지: [https://pribess.github.io/Albatross/](https://pribess.github.io/Albatross/)

실행 순서는 `코드 복사 -> 수강신청 페이지 Console 붙여넣기 -> Enter` 입니다.

### Chrome

1. 수강신청 사이트 페이지를 켭니다.
2. 키보드에서 `F12`를 누릅니다. (Mac은 `Option + Command + J`)
3. 위쪽 탭에서 `Console`을 누릅니다. (Mac 단축키로 이미 Console이 열렸으면 생략)
4. 실행 페이지로 이동해 `Copy` 버튼을 눌러 코드를 복사합니다.
5. 다시 수강신청 사이트의 `Console` 입력줄에 붙여넣고 `Enter`를 누릅니다.

### Safari

Safari는 처음 1회 설정이 필요합니다.

1. Safari 상단 메뉴에서 `Safari > 설정 > 고급`으로 들어갑니다.
2. 맨 아래 `메뉴 막대에서 개발자용 메뉴 보기`를 체크합니다.
3. 수강신청 사이트 페이지를 켭니다.
4. 키보드에서 `Option + Command + C`를 누릅니다.
5. 하단/우측에 열린 개발자창에서 `Console` 탭을 누릅니다.
6. 실행 페이지로 이동해 `Copy` 버튼을 눌러 코드를 복사합니다.
7. 다시 수강신청 사이트의 `Console` 입력줄에 붙여넣고 `Enter`를 누릅니다.

https://github.com/user-attachments/assets/61c6e9e5-25ac-460e-8e14-14c1321c0215

## 주요 기능

- SAP UI5의 수강신청 진입 컨트롤을 `firePress()`로 실행해 원래 페이지의 이벤트 처리, POST, 응답 스크립트 실행, 화면 전환 경로를 유지합니다.
- 응답에 포함된 정수 초 서버 시각과 Resource Timing을 같은 XHR 단위로 묶어 서버-브라우저 시계 오프셋을 추정합니다.
- 초 경계 위상을 분산 탐색하여 오프셋 불확실성을 줄입니다.
- Snipe는 Arm 이후에도 프로브를 계속 수행하다가 `FRZ`초 전에 자동 정지하고 마지막 통계로 발사 시각을 고정합니다.
- Test는 `T−u, T−30ms, T−10ms, T, T+10ms, T+30ms, T+u`를 초 경계에 발사해 EARLY/IN 판정을 확인합니다.
- Macro A/B는 신청 폼의 6개 입력칸을 찾아 기존 값을 덮어쓰고 `input`/`change` 이벤트를 발생시킵니다.

## 시각 추정 및 발사 계산

### 1. 시계와 기호

브라우저 벽시각은 `Date.now()`를 반복해서 읽지 않고, 주입 시점의 벽시각과 단조 시계인 `performance.now()`를 결합해 계산합니다.

```text
E(p) = epochAnchor + p - performanceAnchor
```

문서에서 사용하는 기호는 다음과 같습니다.

| 기호 | 의미 |
| --- | --- |
| `E(p)` | `performance.now() = p`일 때의 브라우저 epoch ms |
| `Sᵢ` | i번째 응답 본문에 적힌 서버 정수 초의 epoch ms |
| `tᵢ` | i번째 XHR의 Resource Timing `startTime`을 epoch로 변환한 값 |
| `TTFBᵢ` | `responseStart - requestStart` |
| `Dᵢ` | `sap-perf-fesrec / 1000`, 서버 내부 처리시간 ms |
| `f` | 추정 단방향 네트워크 지연 |
| `R` | 서버 시각 읽기 여유 구간, 현재 경험값 `40ms` |
| `O` | `서버 시각 - 브라우저 시각` 오프셋 |
| `u` | 최종 오프셋 불확실성 반폭 |

서버가 직접 제공하는 값은 밀리초 벽시각이 아니라 `현재 서버 시간 : YYYY.MM.DD HH:mm:ss` 형식의 **정수 초 `Sᵢ`**입니다. 화면에 표시되는 밀리초 도착 시각은 아래 모델로 계산한 추정값입니다.

### 2. 같은 XHR끼리만 페어링

페이지 자체의 주기 XHR과 Albatross가 `firePress()`로 발생시킨 XHR이 같은 `/zu4a_srs/zcmuik101` URL을 사용하므로 다음 조건으로 요청을 묶습니다.

1. `XMLHttpRequest.send()` 시각, 응답 본문의 `Sᵢ`, `sap-perf-fesrec`을 하나의 캡처에 저장합니다.
2. press 시점 `−10ms ~ +2000ms` 안에서 캡처를 찾습니다.
3. 학습된 5초 ticker 위상에 해당하는 캡처보다 비-ticker 캡처를 우선합니다.
4. Resource Timing의 `startTime`이 캡처의 send 시각과 `±30ms` 이내일 때만 같은 요청으로 인정합니다.
5. 페어링에 실패하면 임의 값을 만들지 않고 `FAIL(no-xhr)` 또는 `FAIL(no-resource)`로 처리합니다.

Resource Timing 버퍼가 가득 차 새 항목이 사라지는 것을 막기 위해 각 프로브 직전에 `performance.clearResourceTimings()`를 실행합니다.

### 3. 네트워크 지연 추정

`sap-perf-fesrec`은 서버 벽시각이 아니라 서버 내부 체류시간입니다. 따라서 첫 바이트까지의 순수 네트워크 구간은 다음처럼 근사합니다.

```text
transitᵢ = max(0, TTFBᵢ - Dᵢ)
transitMin = min(transitᵢ)
f = transitMin / 2
```

최솟값을 사용하는 이유는 큐잉과 일시적인 지연이 추가된 샘플보다 가장 적게 지연된 샘플이 기본 경로 지연에 가깝기 때문입니다. `fesrec` 샘플이 없으면 통계 화면은 `RTTmin / 2`를 참고값으로 표시하지만, 오프셋 교집합 계산의 `f`는 0으로 둡니다.

### 4. 한 샘플이 만드는 오프셋 구간

요청이 브라우저 시각 `tᵢ`에 출발하고 단방향 지연 `f` 뒤 서버에 도착하며, 서버가 도착 후 `0 ~ R` 사이에 시각을 읽는다고 가정합니다. 서버가 반환한 정수 초가 `Sᵢ`라면 오프셋 `O`는 다음 구간에 있어야 합니다.

```text
Lᵢ = Sᵢ        - tᵢ - f - R
Uᵢ = Sᵢ + 1000 - tᵢ - f
Lᵢ ≤ O < Uᵢ
```

최근 최대 60개 샘플의 구간을 교차합니다. 전체 저장량은 최대 96개입니다.

```text
L = max(Lᵢ)
U = min(Uᵢ)
Ô = (L + U) / 2
u = (U - L) / 2
```

교집합이 한 개의 비대칭 지연 샘플 때문에 깨지면 가장 강하게 충돌하는 샘플 하나만 제거하고 다시 계산합니다. 그래도 교집합이 없으면 샘플 midpoint의 중앙값을 임시 오프셋으로 사용하고 불확실성을 최소 `±500ms`로 표시합니다.

표의 `Offset midpoint`는 진단용 원시 구간으로 계산합니다.

```text
rawLowerᵢ = Sᵢ        - responseStartᵢ
rawUpperᵢ = Sᵢ + 1000 - requestStartᵢ
rawMidᵢ   = (rawLowerᵢ + rawUpperᵢ) / 2
```

### 5. Lock 등급

| 등급 | 조건 |
| --- | --- |
| `COARSE` | `u > 200ms` |
| `TRACKING` | `80ms < u ≤ 200ms` |
| `LOCKED` | `25ms < u ≤ 80ms` |
| `TIGHT LOCK` | `u ≤ 25ms` |

추가 샘플은 `u ≤ 12ms`를 목표로 계속 수집합니다. 이는 품질 목표일 뿐 서버가 밀리초 정확도를 보증한다는 뜻은 아닙니다.

### 6. 초 경계 위상 교정

각 샘플의 초 경계 위상을 다음처럼 계산합니다.

```text
φᵢ = wrap1000(Sᵢ - tᵢ)
```

위상들을 0~1000ms 원 위에 정렬하고 가장 큰 미관측 구간의 중앙을 다음 목표 위상으로 선택합니다. 이미 관측한 위상과 `25ms` 이내인 목표는 피하고, 진행량이 너무 작으면 `500ms` 점프합니다.

실측 관계는 다음과 같습니다.

```text
nextPhase ≡ lastPhase - spacing (mod 1000)
advance   = targetPhase - lastPhase (mod 1000)
spacing   ≡ -advance (mod 1000)
```

교정 기본 간격은 `6060ms`이므로 코드의 실제 간격은 다음처럼 정합니다.

```text
jitter  = wrap1000(-advance - 60)
interval = 6060 + jitter
```

초기 9발 뒤에도 `u > 12ms`이면 4초 이상 간격을 두고 6발 적응 교정 라운드를 반복합니다. 교정 외 유지 프로브는 약 11~20초 간격으로 분산됩니다.

### 7. Snipe 계산

Snipe 입력은 다음 의미입니다.

```text
AIM = TGT + OFF
```

- `OFF=0`: `AIM = TGT`
- `OFF=+30`: `AIM = TGT + 30ms`
- `OFF=-30`: `AIM = TGT - 30ms`
- `+u`, `-u`: Arm 시점의 현재 불확실성을 사용

Test와 Snipe는 같은 경로 보정식을 사용합니다.

```text
pathCorrection = f + R/2
               = f + 20ms
SEND = AIM - Ô - pathCorrection
```

따라서 추정 서버 읽기 시각은 다음과 같이 AIM에 맞춰집니다.

```text
estimatedRead = SEND + Ô + f + R/2
              ≈ AIM
```

실제 요청은 raw POST를 직접 만들지 않습니다. SAP UI5 진입 컨트롤의 `firePress()`를 호출해 페이지의 원래 press handler → POST → 응답 스크립트 → UI 전환 경로를 그대로 사용합니다.

#### Arm과 자동 Freeze

Arm 직후에는 프로브를 멈추지 않습니다. 새 샘플이 들어올 때마다 `Ô`, `f`, `SEND`를 다시 계산합니다.

```text
FREEZE = AIM - Ô - FRZ
```

`FRZ`는 10~20초이며 기본값은 15초입니다. FREEZE에 도달하면:

1. 새 프로브를 중지합니다.
2. 진행 중인 프로브가 끝나기를 기다립니다.
3. 거절 다이얼로그의 UI5 lifecycle과 block layer가 정리될 시간을 최대 4초 범위에서 확보합니다.
4. 마지막 통계로 `SEND`를 다시 계산하고 고정합니다.
5. 동결 이후에는 프로브 Resume를 막습니다.

정밀 대기는 남은 시간이 60ms보다 크면 최대 250ms 단위로 자고, 60~6ms 구간에서는 2ms 단위로 대기하며, 마지막 약 6ms는 busy-spin합니다. Disarm 토큰은 모든 구간에서 확인하므로 대기 중에도 취소할 수 있습니다.

### 8. Test 계산과 판정

첫 경계는 실행 약 20초 뒤의 `X.000`으로 잡고 각 발을 설정된 간격만큼 떨어뜨립니다.

```text
Bₖ = wholeSecondAnchor + k × spacing
Aₖ = Bₖ + δₖ
δₖ ∈ { -u, -30, -10, 0, +10, +30, +u }
SENDₖ = Aₖ - Ô - f - R/2
```

응답 뒤 표시용 읽기 시각과 오차는 다음처럼 추정합니다.

```text
estimatedReadₖ = requestStartₖ + Ô + f + R/2
errorₖ = estimatedReadₖ - Aₖ
```

최종 경계 판정은 밀리초 추정값이 아니라 **같은 XHR 응답의 원본 서버 초 `Sₖ`**로 합니다.

```text
Sₖ = Bₖ        → IN
Sₖ = Bₖ - 1000 → EARLY
```

`|δₖ| ≤ u`인 발은 불확실성 경계 안이므로 `IN~`/`EARLY~`로 표시하고 pass denominator에서 제외합니다. 나머지는 음수 offset이면 EARLY, 양수 offset이면 IN을 기대합니다.

### 9. 다이얼로그와 Macro

- `수강신청 시간이 아닙니다` 또는 `수강신청 기간이 아닙니다` 내용의 다이얼로그만 대상으로 합니다.
- `DIALOGMSG.open()`을 막거나 `Dialog.close()`를 강제하지 않습니다. 앱의 `afterOpen → UIUpdated → loading=false`가 끝난 뒤 실제 UI5 확인 버튼의 `firePress()`를 실행합니다.
- 실제 신청 폼은 메시지 내용이 다르므로 자동으로 닫지 않습니다.
- Macro A/B는 `__input6-__list0-0-inner`부터 6개 입력칸을 순서대로 focus하고 값을 덮어쓴 뒤 `input`/`change` 이벤트를 발생시킵니다.
- 저장 버튼 자동 탐지/클릭은 아직 구현되어 있지 않습니다.

### 10. 한계

- 서버가 직접 제공하는 진실은 정수 초 `S`입니다. 화면의 밀리초 값은 네트워크 지연, `40ms` read window, 오프셋 교집합을 사용한 모델 추정치입니다.
- `sap-perf-fesrec`은 서버 내부 처리시간이지 서버 벽시각이 아닙니다.
- `R=40ms`는 관측 기반 경험값이며 서버 계약값이 아닙니다.
- 페이지 ticker 제외는 관측된 5초 위상을 이용한 휴리스틱이므로 오탐 가능성이 있습니다. 최종 페어링은 같은 XHR의 본문/헤더와 Resource Timing `±30ms` 조건으로 다시 제한합니다.
- 성공 응답에서 실제 신청 폼이 열리는 경로는 신청 가능 시간대의 실응답으로 최종 검증해야 합니다.
- Console에 코드를 다시 붙여넣으면 기존 인스턴스를 파괴하고 재설치하므로 수집한 샘플이 초기화됩니다.

## 개발용 CDP 실행

Chrome을 원격 디버깅 모드로 실행한 뒤 빌드 결과를 현재 탭에 주입할 수 있습니다.

```bash
open -na "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.albatross-chrome-profile" \
  --no-first-run

bun run build
bun run inject sis109
```

읽기 전용 서버 시각 소스 탐색:

```bash
bun run scripts/explore-time.ts
```

탐색 결과 `scripts/explore-time-output.json`은 세션 URL과 응답 내용을 포함할 수 있으므로 Git에 커밋하지 않습니다.

## Build

- 빌드: `bun run build`

## Commands

- `bun run format`
- `bun run lint`
- `bun run build`
- `bun run inject [url-substring]`
- `bun run check`

## Disclaimer

이 프로젝트 사용으로 인해 발생하는 모든 결과(계정 제재, 수강신청 실패, 데이터 손실, 기타 직/간접적 피해 포함)에 대한 책임은 전적으로 사용자에게 있으며, 개발자는 이에 대해 어떠한 법적/재정적 책임도 지지 않습니다.
