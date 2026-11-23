(() => {
  const overlayId = "__MY_MACRO_OVERLAY__";
  const minimumProbeIntervalMs = 3_000;
  const maximumSamples = 96;
  // The intersection must retain the phase coverage the calibration shots paid
  // for: a short window forgets covered phases and uncertainty stagnates at the
  // equilibrium of ~20 random phases (observed maxGap 102 ms over all samples
  // vs 542 ms over the last 20). 60 samples ≈ 15+ min — drift stays bounded.
  const statisticsWindowSamples = 60;
  const adaptiveShotCount = 6;
  // Keep refining well past LOCKED (80) toward the phase-gap floor; the previous
  // target of 60 stalled the tool at ≈±60 forever once reached.
  const recalibrationTargetMs = 12;
  // Read window: the server reads its clock between arrival and arrival + 40 ms.
  const readMarginMs = 40;
  const probePath = "/zu4a_srs/zcmuik101";
  const tab1SourceInputIds = ["input1", "input2", "input3", "input4", "input5", "input6"];
  const tab2SourceInputIds = ["input7", "input8", "input9", "input10", "input11", "input12"];
  const targetInputIds = [
    "__input6-__list0-0-inner",
    "__input6-__list0-1-inner",
    "__input6-__list0-2-inner",
    "__input6-__list0-3-inner",
    "__input6-__list0-4-inner",
    "__input6-__list0-5-inner",
  ];

  type OverlayController = {
    destroy: () => void;
    pause: () => void;
  };

  type AlbatrossWindow = Window & {
    __ALBATROSS_CONTROLLER__?: OverlayController;
    __ALBATROSS_SAMPLES__?: () => ProbeSample[];
  };

  type SapModel = {
    getProperty?: (path: string) => unknown;
  };

  type SapControl = {
    firePress?: () => void;
    getModel?: () => SapModel | undefined;
    getBindingInfo?: (property: string) => {
      path?: string;
      parts?: Array<{ path?: string }>;
    };
    getTitle?: () => string;
    isOpen?: () => boolean;
    attachEventOnce?: (name: string, listener: () => void) => void;
    close?: () => void;
  };

  type SapRuntime = {
    ui?: {
      getCore?: () => {
        byId?: (id: string) => SapControl | undefined;
      };
    };
  };

  type ProbeSample = {
    sequence: number;
    serverSecondMs: number;
    requestStartEpochMs: number;
    responseEndEpochMs: number;
    rttMs: number;
    ttfbMs: number;
    serverInternalMs: number | null;
    plannedIntervalMs: number | null;
    startDeltaMs: number | null;
    lowerOffsetMs: number;
    upperOffsetMs: number;
    midpointOffsetMs: number;
  };

  const albatrossWindow = window as AlbatrossWindow;
  const previousController = albatrossWindow.__ALBATROSS_CONTROLLER__;
  // Console-paste friendly reinjection: destroy the old instance and continue
  // installing the new one in this same evaluation (no second paste required).
  previousController?.destroy();
  document.getElementById(overlayId)?.remove();

  const epochAnchorMs = Date.now();
  const performanceAnchorMs = performance.now();
  const epochFromPerformance = (performanceMs: number) =>
    epochAnchorMs + performanceMs - performanceAnchorMs;
  const epochNow = () => epochFromPerformance(performance.now());
  const sleep = (milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

  const host = document.createElement("div");
  host.id = overlayId;
  host.style.cssText =
    "position:fixed;top:28px;right:28px;width:min(420px,calc(100vw - 24px));z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "open" });

  const macroInputs = (ids: string[]) =>
    ids
      .map(
        (id, index) =>
          `<label class="field"><span>${String(index + 1).padStart(2, "0")}</span><input id="${id}" autocomplete="off" placeholder="Course code" /></label>`,
      )
      .join("");

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      .shell {
        --ink: #e9f2f4;
        --muted: #81949b;
        --line: rgba(135, 168, 176, .18);
        --cyan: #5be7d7;
        --amber: #f2bd62;
        width: 100%;
        overflow: hidden;
        color: var(--ink);
        background:
          linear-gradient(145deg, rgba(17, 31, 35, .98), rgba(7, 15, 18, .99)),
          repeating-linear-gradient(90deg, transparent 0 11px, rgba(255,255,255,.015) 12px);
        border: 1px solid rgba(135, 190, 194, .28);
        border-radius: 5px;
        box-shadow: 0 24px 70px rgba(0,0,0,.48), inset 0 1px rgba(255,255,255,.04);
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        letter-spacing: -.015em;
      }
      .masthead {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 48px;
        padding: 0 12px 0 15px;
        border-bottom: 1px solid var(--line);
        cursor: move;
        user-select: none;
        touch-action: none;
      }
      .brand { display: flex; align-items: center; gap: 10px; }
      .mark {
        width: 9px;
        height: 9px;
        background: var(--cyan);
        border-radius: 50%;
        box-shadow: 0 0 15px rgba(91,231,215,.8);
      }
      .mark.paused { background: #65767c; box-shadow: none; }
      .brand strong { font-size: 12px; letter-spacing: .15em; }
      .brand small { color: var(--muted); font-size: 9px; letter-spacing: .12em; }
      .close {
        width: 29px;
        height: 29px;
        border: 0;
        color: var(--muted);
        background: transparent;
        cursor: pointer;
        border-radius: 3px;
      }
      .close:hover { color: var(--ink); background: rgba(255,255,255,.06); }
      .tabs {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        padding: 8px;
        gap: 5px;
        border-bottom: 1px solid var(--line);
      }
      .tab {
        padding: 8px 6px;
        color: var(--muted);
        background: transparent;
        border: 1px solid transparent;
        border-radius: 3px;
        cursor: pointer;
        font-size: 10px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .tab[aria-selected="true"] {
        color: var(--ink);
        border-color: var(--line);
        background: rgba(91,231,215,.075);
      }
      .panel { padding: 15px; }
      .panel[hidden] { display: none; }
      .clock-face {
        position: relative;
        padding: 14px 0 13px;
        border-bottom: 1px solid var(--line);
      }
      .eyebrow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--muted);
        font-size: 9px;
        letter-spacing: .14em;
        text-transform: uppercase;
      }
      .quality {
        color: var(--amber);
        letter-spacing: .08em;
      }
      .time {
        margin-top: 7px;
        color: var(--cyan);
        font-size: clamp(31px, 9vw, 42px);
        line-height: 1;
        letter-spacing: -.065em;
        font-variant-numeric: tabular-nums;
        text-shadow: 0 0 25px rgba(91,231,215,.15);
      }
      .date-line {
        margin-top: 8px;
        color: var(--muted);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1px;
        margin: 13px 0;
        background: var(--line);
        border: 1px solid var(--line);
      }
      .metric { min-width: 0; padding: 10px 8px; background: #0c181b; }
      .metric span {
        display: block;
        color: var(--muted);
        font-size: 8px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .metric strong {
        display: block;
        overflow: hidden;
        margin-top: 5px;
        color: var(--ink);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        text-overflow: ellipsis;
      }
      .plot-card {
        padding: 10px 10px 7px;
        border: 1px solid var(--line);
        background: rgba(0,0,0,.16);
      }
      .plot-head { display: flex; justify-content: space-between; color: var(--muted); font-size: 9px; }
      .plot-head b { color: var(--ink); font-weight: 500; }
      #rttPlot { display: block; width: 100%; height: 78px; margin-top: 6px; overflow: visible; }
      .gridline { stroke: rgba(135,168,176,.12); stroke-width: 1; }
      .median-line { stroke: var(--amber); stroke-width: 1; stroke-dasharray: 3 4; }
      .rtt-line { fill: none; stroke: var(--cyan); stroke-width: 2; vector-effect: non-scaling-stroke; }
      .rtt-point { fill: #0c181b; stroke: var(--cyan); stroke-width: 1.5; }
      .empty-plot { fill: var(--muted); font-size: 9px; letter-spacing: .08em; }
      .probe-table { width: 100%; margin-top: 12px; border-collapse: collapse; table-layout: fixed; }
      .probe-table th {
        padding: 0 4px 6px;
        color: var(--muted);
        font-size: 8px;
        font-weight: 400;
        letter-spacing: .08em;
        text-align: right;
        text-transform: uppercase;
      }
      .probe-table th:nth-child(-n+2), .probe-table td:nth-child(-n+2) { text-align: left; }
      .probe-table td {
        padding: 6px 4px;
        border-top: 1px solid rgba(135,168,176,.1);
        color: #b8c7cb;
        font-size: 9px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .probe-table td:first-child { width: 30px; color: var(--muted); }
      .controls { display: grid; grid-template-columns: 1fr auto; gap: 7px; margin-top: 12px; }
      .action {
        min-height: 36px;
        border: 1px solid rgba(91,231,215,.34);
        border-radius: 3px;
        color: #071719;
        background: var(--cyan);
        cursor: pointer;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .action:hover { filter: brightness(1.08); }
      .action.secondary { width: 78px; color: var(--muted); background: transparent; border-color: var(--line); }
      .status-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 9px;
        color: var(--muted);
        font-size: 8px;
        line-height: 1.4;
      }
      #probeStatus { color: var(--amber); }
      .fields { display: grid; gap: 6px; }
      .field { display: grid; grid-template-columns: 28px 1fr; align-items: center; }
      .field span { color: var(--muted); font-size: 9px; }
      .field input, .field select {
        width: 100%;
        padding: 9px 10px;
        border: 1px solid var(--line);
        border-radius: 3px;
        outline: none;
        color: var(--ink);
        background: #091316;
        font-size: 11px;
      }
      .field input:focus { border-color: rgba(91,231,215,.55); box-shadow: 0 0 0 2px rgba(91,231,215,.08); }
      .macro-help { margin: 0 0 12px; color: var(--muted); font-size: 9px; line-height: 1.55; }
      .macro-status { min-height: 14px; margin-top: 8px; color: var(--amber); font-size: 9px; }
      .snipe-count {
        margin: 13px 0 11px;
        color: var(--amber);
        font-size: 27px;
        line-height: 1;
        letter-spacing: -.04em;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .snipe-plan { margin-top: 9px; color: var(--muted); font-size: 9px; line-height: 1.6; white-space: pre-line; }
      @media (max-width: 460px) {
        .metrics { grid-template-columns: repeat(2, 1fr); }
        .time { font-size: 34px; }
      }
      @media (prefers-reduced-motion: no-preference) {
        .shell { animation: arrive .22s ease-out both; }
        @keyframes arrive { from { opacity: 0; transform: translateY(-8px) scale(.99); } }
      }
    </style>
    <section class="shell" aria-label="Albatross server clock monitor">
      <header class="masthead" id="dragHandle">
        <div class="brand"><i class="mark" id="activityMark"></i><div><strong>ALBATROSS</strong><br><small>SERVER CLOCK LAB</small></div></div>
        <button class="close" id="closeBtn" type="button" aria-label="Close">✕</button>
      </header>
      <nav class="tabs" aria-label="Tools">
        <button class="tab" data-tab="clock" aria-selected="true" type="button">Clock</button>
        <button class="tab" data-tab="snipe" aria-selected="false" type="button">Snipe</button>
        <button class="tab" data-tab="test" aria-selected="false" type="button">Test</button>
        <button class="tab" data-tab="macro1" aria-selected="false" type="button">Macro A</button>
        <button class="tab" data-tab="macro2" aria-selected="false" type="button">Macro B</button>
      </nav>
      <main>
        <section class="panel" data-panel="clock">
          <div class="clock-face">
            <div class="eyebrow"><span>Estimated server time · KST</span><span class="quality" id="quality">CALIBRATING</span></div>
            <div class="time" id="serverClock">--:--:--.---</div>
            <div class="date-line" id="serverDate">Waiting for the first server sample</div>
          </div>
          <div class="metrics">
            <div class="metric"><span>Offset best</span><strong id="offsetBest">—</strong></div>
            <div class="metric"><span>Uncertainty</span><strong id="uncertainty">—</strong></div>
            <div class="metric"><span>RTT min</span><strong id="rttMin">—</strong></div>
            <div class="metric"><span>One-way f̂</span><strong id="oneWayEst">—</strong></div>
          </div>
          <div class="plot-card">
            <div class="plot-head"><b>ROUND-TRIP TRACE</b><span id="sampleCount">n = 0</span></div>
            <svg id="rttPlot" viewBox="0 0 360 78" preserveAspectRatio="none" role="img" aria-label="Recent RTT plot"></svg>
          </div>
          <table class="probe-table" aria-label="Recent probes">
            <thead><tr><th>#</th><th>Server second</th><th>RTT</th><th>TTFB</th><th>Offset midpoint</th></tr></thead>
            <tbody id="probeRows"></tbody>
          </table>
          <div class="controls">
            <button class="action" id="toggleProbe" type="button">Pause probes</button>
            <button class="action secondary" id="resetSamples" type="button">Reset</button>
          </div>
          <div class="status-row"><span id="probeStatus">Preparing probe…</span><span id="nextProbe">PHASE SWEEP · 11–20 s</span></div>
        </section>
        <section class="panel" data-panel="snipe" hidden>
          <p class="macro-help">Arrival/read aims at TGT + OFF using the Test model. FRZ keeps syncing after Arm, then stops probes automatically 10–20 s before AIM.</p>
          <div class="fields">
            <label class="field"><span>TGT</span><input id="snipeTarget" autocomplete="off" placeholder="10:00:00.000" /></label>
            <label class="field"><span>OFF</span><input id="snipeOffset" autocomplete="off" value="0" placeholder="0 / +30 / −u" /></label>
            <label class="field"><span>FRZ</span><input id="snipeFreeze" inputmode="numeric" autocomplete="off" value="15" placeholder="10–20 seconds" /></label>
            <label class="field"><span>CNT</span><input id="snipeCount" inputmode="numeric" autocomplete="off" value="1" /></label>
            <label class="field"><span>GAP</span><input id="snipeGap" inputmode="numeric" autocomplete="off" value="35" /></label>
          </div>
          <div class="snipe-count" id="snipeCountdown">STANDBY</div>
          <div class="controls">
            <button class="action" id="snipeArm" type="button">Arm sniper</button>
            <button class="action secondary" id="snipeNow" type="button">Fire now</button>
          </div>
          <div class="snipe-plan" id="snipePlan">Arm needs a locked offset — keep probing until LOCKED or better.</div>
        </section>
        <section class="panel" data-panel="test" hidden>
          <p class="macro-help">Validation: 7 shots around a whole-second boundary, one per 12 s — aims at T−u, T−30, T−10, T±0, T+10, T+30, T+u. The server's own second signs each verdict: IN (crossed) vs EARLY (fell short). −30/−10 must be EARLY; +30/+u must be IN.</p>
          <div class="fields">
            <label class="field"><span>GAP</span><input id="testSpacing" inputmode="numeric" autocomplete="off" value="12" /></label>
          </div>
          <div class="controls"><button class="action" id="testRun" type="button">Run test</button></div>
          <div class="macro-status" id="testStatus">Idle — needs a locked offset (keep probing first).</div>
          <table class="probe-table" aria-label="Snipe timing test results">
            <thead><tr><th>#</th><th>Aim</th><th>Arrival</th><th>Err</th><th>S</th><th>RTT</th></tr></thead>
            <tbody id="testRows"></tbody>
          </table>
        </section>
        <section class="panel" data-panel="macro1" hidden>
          <p class="macro-help">Paste whitespace-separated course values into any row to fill the remaining slots.</p>
          <div class="fields">${macroInputs(tab1SourceInputIds)}</div>
          <div class="controls"><button class="action" data-run-macro="0" type="button">Apply Macro A</button></div>
          <div class="macro-status" data-macro-status="0"></div>
        </section>
        <section class="panel" data-panel="macro2" hidden>
          <p class="macro-help">A second independent preset for the six registration inputs.</p>
          <div class="fields">${macroInputs(tab2SourceInputIds)}</div>
          <div class="controls"><button class="action" data-run-macro="1" type="button">Apply Macro B</button></div>
          <div class="macro-status" data-macro-status="1"></div>
        </section>
      </main>
    </section>`;

  document.body.appendChild(host);
  performance.setResourceTimingBufferSize(1_000);

  const requireElement = <ElementType extends Element>(selector: string) => {
    const element = shadow.querySelector<ElementType>(selector);
    if (!element) {
      throw new Error(`Albatross UI element not found: ${selector}`);
    }
    return element;
  };

  const serverClock = requireElement<HTMLDivElement>("#serverClock");
  const serverDate = requireElement<HTMLDivElement>("#serverDate");
  const quality = requireElement<HTMLSpanElement>("#quality");
  const offsetBest = requireElement<HTMLElement>("#offsetBest");
  const rttMinMetric = requireElement<HTMLElement>("#rttMin");
  const oneWayEst = requireElement<HTMLElement>("#oneWayEst");
  const uncertainty = requireElement<HTMLElement>("#uncertainty");
  const snipeTargetInput = requireElement<HTMLInputElement>("#snipeTarget");
  const snipeOffsetInput = requireElement<HTMLInputElement>("#snipeOffset");
  const snipeFreezeInput = requireElement<HTMLInputElement>("#snipeFreeze");
  const snipeCountInput = requireElement<HTMLInputElement>("#snipeCount");
  const snipeGapInput = requireElement<HTMLInputElement>("#snipeGap");
  const snipeCountdown = requireElement<HTMLElement>("#snipeCountdown");
  const snipeArm = requireElement<HTMLButtonElement>("#snipeArm");
  const snipeNow = requireElement<HTMLButtonElement>("#snipeNow");
  const snipePlanElement = requireElement<HTMLElement>("#snipePlan");
  const testSpacingInput = requireElement<HTMLInputElement>("#testSpacing");
  const testRunButton = requireElement<HTMLButtonElement>("#testRun");
  const testStatusElement = requireElement<HTMLElement>("#testStatus");
  const testRows = requireElement<HTMLTableSectionElement>("#testRows");
  const sampleCount = requireElement<HTMLSpanElement>("#sampleCount");
  const rttPlot = requireElement<SVGSVGElement>("#rttPlot");
  const probeRows = requireElement<HTMLTableSectionElement>("#probeRows");
  const probeStatus = requireElement<HTMLSpanElement>("#probeStatus");
  const nextProbe = requireElement<HTMLSpanElement>("#nextProbe");
  const toggleProbe = requireElement<HTMLButtonElement>("#toggleProbe");
  const resetSamples = requireElement<HTMLButtonElement>("#resetSamples");
  const activityMark = requireElement<HTMLElement>("#activityMark");
  const closeButton = requireElement<HTMLButtonElement>("#closeBtn");
  const dragHandle = requireElement<HTMLElement>("#dragHandle");

  let samples: ProbeSample[] = [];
  let probeSequence = 0;
  let probeRunning = false;
  let probeInFlight = false;
  let probeLoopToken = 0;
  let nextProbeAtPerformanceMs = performance.now();
  let lastRequestStartPerformanceMs = -Infinity;
  let animationFrameId = 0;
  let intervalIndex = 0;
  let adaptiveCalibration = false;
  let lastCalibrationEndAtPerformanceMs = -Infinity;
  // Observed (planned − actual) phase advance error, averaged. Shots consistently
  // land 4-8 ms short of the plan (dwell-jitter asymmetry); without correction the
  // final rounds (<30 ms gaps) miss gap centers. Correct the next plan by the
  // running mean so single shots keep landing where aimed.
  let phaseAdvanceErrorMeanMs = 0;
  let phaseAdvanceErrorCount = 0;
  let lastAimTargetPhaseMs: number | null = null;
  let lastPlannedIntervalMs: number | null = null;
  const probeIntervalsMs = [
    11_137, 14_283, 17_059, 12_911, 15_447, 18_733, 12_271, 16_619, 19_887, 13_553,
  ];
  // Fast calibration: server dwell is ~1.04 s, so requests must be spaced just above
  // it — no bursts (they queue on the server and corrupt timings). At 1.06 s spacing
  // each shot advances the second-phase by exactly 60 ms, covering the full 1 s
  // phase space on a 60 ms grid in ~18 shots (~19 s). Afterwards the gentle 3–6 s
  // sweep takes over for drift maintenance.
  // Fast calibration. Base spacing must exceed a probe's full completion time
  // (response dwell ≈1.03 s + model-refresh wait that can stretch to ~2 s) with a
  // comfortable margin — at 3.06 s it was borderline, so ~half the shots still
  // fired on completion and the phase froze. At 4.06 s the deadline always wins,
  // so each shot advances the phase by exactly (60 + jitter) mod 1 s.
  // Base 6.06 s: probe completion is now ~1.2 s (S parsed straight from the
  // response body, no model polling), so no completion-lock risk, and 6.06 s
  // stays slower than the app's 5 s ticker while advancing the phase +60 ms per
  // shot. Coarse pass is 9 shots (~100-200 ms grid); adaptive rounds then aim at
  // gap midpoints directly — provably better than a long fixed schedule.
  const calibrationIntervalMs = 6_060;
  const calibrationShotCount = 9;
  // Deterministic spacing jitter: with the 6.06 s base, every distinct jitter gives
  // a distinct phase jump mod 1 s. First 9 shots cover the phase ring at ~400 ms
  // steps, second pass refines to ~50 ms.
  const calibrationJitterScheduleMs = [
    0, 400, 800, 200, 600, 100, 500, 900, 300, 50, 450, 850, 250, 650, 150, 550, 950, 350,
  ];
  let calibrationShotsRemaining = calibrationShotCount;
  // Adaptive from the very first shot: every shot aims at the largest uncovered
  // phase gap. A fixed grid schedule re-visits already-covered phases whenever
  // it restarts with retained samples (observed: shots landing +4 ms from
  // existing samples — accepted, but zero tightening).

  // sap-perf-fesrec (µs) measures server-internal dwell per request. Hooking XHR
  // captures each zcmuik101 round-trip — send time, dwell, AND the server second
  // parsed from that same response's body. The app also fires its own zcmuik101
  // requests (server-time ticker); taking S from the model while timing comes from
  // our resource entry mispairs the two and voids the intersection. Everything
  // must come from one and the same XHR.
  type XhrCapture = {
    sentAtPerformanceMs: number;
    fesrecMs: number | null;
    serverSecondMs: number | null;
  };
  const xhrCaptures: XhrCapture[] = [];
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    _method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    (this as XMLHttpRequest & { __albatrossUrl?: string }).__albatrossUrl = String(url);
    return (originalXhrOpen as (...args: unknown[]) => void).call(this, _method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, ...args: unknown[]) {
    const sentAtPerformanceMs = performance.now();
    const capture: XhrCapture = { sentAtPerformanceMs, fesrecMs: null, serverSecondMs: null };
    let isProbeXhr = false;
    try {
      isProbeXhr = /\/zu4a_srs\/zcmuik101/.test(
        (this as XMLHttpRequest & { __albatrossUrl?: string }).__albatrossUrl ?? "",
      );
    } catch {
      // Best-effort capture only.
    }
    if (isProbeXhr) {
      xhrCaptures.push(capture);
      if (xhrCaptures.length > 48) {
        xhrCaptures.shift();
      }
    }
    this.addEventListener("loadend", () => {
      if (!isProbeXhr) {
        return;
      }
      try {
        const fesrecUs = Number(this.getResponseHeader("sap-perf-fesrec"));
        if (Number.isFinite(fesrecUs) && fesrecUs > 0) {
          capture.fesrecMs = fesrecUs / 1_000;
        }
      } catch {
        // Header access can throw for non-default response types.
      }
      try {
        if (this.responseType === "" || this.responseType === "text") {
          capture.serverSecondMs = parseServerSecond(this.responseText);
        }
      } catch {
        // Body may be unavailable; model fallback covers it.
      }
    });
    return (originalXhrSend as (...args: unknown[]) => void).apply(this, args);
  };

  const median = (values: number[]) => {
    if (values.length === 0) {
      return Number.NaN;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const middleValue = sorted[middle];
    if (middleValue === undefined) {
      return Number.NaN;
    }
    if (sorted.length % 2 === 1) {
      return middleValue;
    }
    return ((sorted[middle - 1] ?? middleValue) + middleValue) / 2;
  };

  const getStatistics = () => {
    if (samples.length === 0) {
      return null;
    }

    const windowSamples = samples.slice(-statisticsWindowSamples);
    const fesrecSamples = windowSamples.filter(
      (sample): sample is ProbeSample & { serverInternalMs: number } =>
        sample.serverInternalMs !== null,
    );
    // fesrec yields pure network transit: TTFB - dwell (≈2-5 ms here), so the
    // one-way forward delay collapses from RTT_min/2 to transit/2.
    const transitValuesMs = fesrecSamples
      .map((sample) => Math.max(0, sample.ttfbMs - sample.serverInternalMs))
      .filter((value) => Number.isFinite(value));
    const transitMinimumMs = transitValuesMs.length > 0 ? Math.min(...transitValuesMs) : null;
    const forwardEstimateMs = transitMinimumMs !== null ? transitMinimumMs / 2 : 0;

    // Unified intersection over every window sample. The server reads its clock at
    // the START of its ~1.03 s dwell (proven by the data: full-dwell subtraction
    // inflates the width by ≈ dwell, while a start-read model matches the observed
    // width ≈ residual phase gap). So bounds shift only by a small read margin,
    // not the full dwell. Width then ≈ phase gap + transit/read jitter (a few ms).
    let pool = windowSamples.map((sample) => ({
      sample,
      lowerBoundMs:
        sample.serverSecondMs - sample.requestStartEpochMs - forwardEstimateMs - readMarginMs,
      upperBoundMs: sample.serverSecondMs + 1_000 - sample.requestStartEpochMs - forwardEstimateMs,
    }));
    let lowerOffsetMs = Math.max(...pool.map((entry) => entry.lowerBoundMs));
    let upperOffsetMs = Math.min(...pool.map((entry) => entry.upperBoundMs));
    if (lowerOffsetMs > upperOffsetMs && pool.length > 3) {
      // One asymmetric-jitter sample can void the intersection; drop the worst
      // offender once so a single bad probe cannot throw us back to ±500 ms.
      const lowers = pool.map((entry) => entry.lowerBoundMs).sort((left, right) => left - right);
      const uppers = pool.map((entry) => entry.upperBoundMs).sort((left, right) => left - right);
      const maxLower = lowers.at(-1) ?? Number.NaN;
      const secondLower = lowers.at(-2) ?? maxLower;
      const minUpper = uppers.at(0) ?? Number.NaN;
      const secondUpper = uppers.at(1) ?? minUpper;
      const dropLowerSide = maxLower - secondLower > secondUpper - minUpper;
      const offenderIndex = pool.findIndex((entry) =>
        dropLowerSide
          ? entry.lowerBoundMs === (dropLowerSide ? maxLower : minUpper)
          : entry.upperBoundMs === minUpper,
      );
      if (offenderIndex >= 0) {
        pool = pool.filter((_, index) => index !== offenderIndex);
        lowerOffsetMs = Math.max(...pool.map((entry) => entry.lowerBoundMs));
        upperOffsetMs = Math.min(...pool.map((entry) => entry.upperBoundMs));
      }
    }
    const midpointMedianMs = median(windowSamples.map((sample) => sample.midpointOffsetMs));
    const hasIntersection = lowerOffsetMs <= upperOffsetMs;
    const offsetMs = hasIntersection ? (lowerOffsetMs + upperOffsetMs) / 2 : midpointMedianMs;
    const deviations = windowSamples.map((sample) =>
      Math.abs(sample.midpointOffsetMs - midpointMedianMs),
    );
    const uncertaintyMs = hasIntersection
      ? (upperOffsetMs - lowerOffsetMs) / 2
      : Math.max(500, median(deviations) + median(windowSamples.map((sample) => sample.rttMs)) / 2);

    // Arrival phase of each window sample on the server-second ring — lets the
    // adaptive calibration aim the next probe at the largest uncovered gap.
    const phases = windowSamples.map(
      (sample) => (((sample.serverSecondMs - sample.requestStartEpochMs) % 1_000) + 1_000) % 1_000,
    );

    return {
      offsetMs,
      midpointMedianMs,
      uncertaintyMs,
      rawUncertaintyMs: uncertaintyMs,
      fesrecSampleCount: fesrecSamples.length,
      rttMedianMs: median(windowSamples.map((sample) => sample.rttMs)),
      rttMinimumMs: Math.min(...windowSamples.map((sample) => sample.rttMs)),
      ttfbMinimumMs: Math.min(...windowSamples.map((sample) => sample.ttfbMs)),
      transitMinimumMs,
      bestSampleCount: windowSamples.length,
      hasIntersection,
      phases,
    };
  };

  // Choose the next calibration spacing so the next probe's arrival phase lands in
  // the middle of the largest uncovered phase gap. Verified relation from live
  // data: next phase ≡ last phase − spacing (mod 1 s), so spacing ≡ −jump.
  // Pure open-loop aiming: advance = jump (verified physics: phase advance ≡
  // −spacing mod 1 s, landing scatter ±5 ms). The closed-loop miss correction is
  // gone — its feedback loop created a fixed point where every shot landed on the
  // previous one (observed: 5 consecutive plans ≈6994, landings 683±3) instead of
  // splitting the largest gap.
  const computeAdaptiveAimTargetPhaseMs = (): number | null => {
    const statistics = getStatistics();
    const phases = statistics?.phases ?? [];
    if (phases.length < 3) {
      return null;
    }
    const sorted = [...phases].sort((left, right) => left - right);
    const gapList: Array<{ start: number; size: number }> = [];
    for (let index = 1; index < sorted.length; index += 1) {
      gapList.push({
        start: sorted[index - 1] ?? 0,
        size: (sorted[index] ?? 0) - (sorted[index - 1] ?? 0),
      });
    }
    gapList.push({
      start: sorted.at(-1) ?? 0,
      size: 1_000 - (sorted.at(-1) ?? 0) + (sorted[0] ?? 0),
    });
    gapList.sort((left, right) => right.size - left.size);
    // Prefer the largest gap whose midpoint is not within 25 ms of any covered
    // phase — guarantees every shot lands somewhere genuinely new.
    for (const gap of gapList) {
      const midpoint = (gap.start + gap.size / 2) % 1_000;
      if (!phases.some((phase) => Math.abs(wrapPhaseSigned(midpoint - phase)) <= 25)) {
        return midpoint;
      }
    }
    return (gapList[0]?.start + (gapList[0]?.size ?? 0) / 2) % 1_000;
  };

  const wrapPhase = (value: number) => ((value % 1_000) + 1_000) % 1_000;
  const wrapPhaseSigned = (value: number) => wrapPhase(value + 500) - 500;
  const samplePhase = (sample: ProbeSample) =>
    wrapPhase(sample.serverSecondMs - sample.requestStartEpochMs);

  const formatDuration = (milliseconds: number) =>
    Number.isFinite(milliseconds) ? `${milliseconds.toFixed(1)} ms` : "—";
  const formatSignedDuration = (milliseconds: number) => {
    if (!Number.isFinite(milliseconds)) {
      return "—";
    }
    const sign = milliseconds >= 0 ? "+" : "−";
    return `${sign}${Math.abs(milliseconds).toFixed(1)} ms`;
  };
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const formatKoreaTime = (epochMs: number, includeMilliseconds: boolean) => {
    const koreaDate = new Date(epochMs + 9 * 60 * 60 * 1_000);
    const time = `${pad(koreaDate.getUTCHours())}:${pad(koreaDate.getUTCMinutes())}:${pad(koreaDate.getUTCSeconds())}`;
    return includeMilliseconds ? `${time}.${pad(koreaDate.getUTCMilliseconds(), 3)}` : time;
  };
  const formatKoreaDate = (epochMs: number) => {
    const koreaDate = new Date(epochMs + 9 * 60 * 60 * 1_000);
    return `${koreaDate.getUTCFullYear()}.${pad(koreaDate.getUTCMonth() + 1)}.${pad(koreaDate.getUTCDate())}`;
  };

  const parseServerSecond = (message: string) => {
    const match = message.match(
      /현재\s*서버\s*시간\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
    );
    if (!match) {
      return null;
    }

    const [, year, month, day, hour, minute, second] = match;
    if (!year || !month || !day || !hour || !minute || !second) {
      return null;
    }

    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 9,
      Number(minute),
      Number(second),
    );
  };

  const getSapRuntime = () => (window as Window & { sap?: SapRuntime }).sap;
  const getSapControl = (id: string) => getSapRuntime()?.ui?.getCore?.()?.byId?.(id);

  const findProbeControl = () => {
    const image = Array.from(document.querySelectorAll<HTMLImageElement>("img[data-sap-ui]")).find(
      (element) => /\/enter_(?:on|off)\.png(?:$|\?)/.test(element.src),
    );
    if (!image) {
      return null;
    }
    const control = getSapControl(image.id);
    return control?.firePress ? control : null;
  };

  const readServerMessage = (preferredControl?: SapControl | null) => {
    const preferredValue = preferredControl?.getModel?.()?.getProperty?.("/GS_MSG/MESSAGE");
    if (typeof preferredValue === "string") {
      return preferredValue;
    }

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[data-sap-ui]"))) {
      const control = getSapControl(element.id);
      const binding = control?.getBindingInfo?.("text");
      const paths = [binding?.path, ...(binding?.parts?.map((part) => part.path) ?? [])];
      if (!paths.includes("/GS_MSG/MESSAGE")) {
        continue;
      }
      const value = control?.getModel?.()?.getProperty?.("/GS_MSG/MESSAGE");
      if (typeof value === "string") {
        return value;
      }
    }
    return null;
  };

  const isProbeResource = (entry: PerformanceResourceTiming, startedAfterMs: number) => {
    try {
      return (
        new URL(entry.name).pathname === probePath &&
        entry.initiatorType === "xmlhttprequest" &&
        entry.startTime >= startedAfterMs - 1 &&
        entry.responseEnd > 0
      );
    } catch {
      return false;
    }
  };

  const waitForProbeResource = async (sentAtPerformanceMs: number) => {
    const deadline = performance.now() + 15_000;
    while (performance.now() < deadline) {
      // STRICT pairing: only the resource whose wire-start matches OUR captured
      // XHR send within ±30 ms. The old "earliest after send" rule let the app
      // ticker's XHR (fires on a 5 s period, shared connection, wire-start can
      // lag send by ~100 ms) be mistaken for ours — producing arrivals ~1.5 s
      // off and verdicts signed by the wrong response.
      const entries = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        .filter((entry) => isProbeResource(entry, sentAtPerformanceMs - 5))
        .filter((entry) => Math.abs(entry.startTime - sentAtPerformanceMs) <= 30);
      const match = entries.at(0);
      if (match) {
        return match;
      }
      await sleep(25);
    }
    return null;
  };

  // Our press starts its XHR within milliseconds of the trigger; the app's own
  // ticker requests come later, so the first capture at/after the trigger is ours.
  // Our press starts its XHR within milliseconds of the trigger (measured 2-5 ms);
  // the app's ticker runs on a fixed 5.000 s period, so a wide window lets ticker
  // requests be mistaken for ours (constant phase, useless samples). A 400 ms
  // window keeps collisions rare while tolerating press-handler latency.
  // The app ticker fires zcmuik101 XHRs on an exact 5.000 s grid. Learn the
  // ticker phase from capture history so those captures can be excluded —
  // otherwise a ticker request near our trigger gets mistaken for ours and
  // every downstream value (S verdict, arrival) describes the wrong request.
  const tickerPhasePerformanceMs = (): number | null => {
    const stamps = xhrCaptures.map((capture) => capture.sentAtPerformanceMs);
    if (stamps.length < 4) {
      return null;
    }
    // Look for consecutive 5.000 s pairs to lock the phase.
    for (let i = stamps.length - 1; i > 0; i -= 1) {
      for (let j = i - 1; j >= 0; j -= 1) {
        const delta = stamps[i]! - stamps[j]!;
        if (Math.abs(delta % 5_000) < 60 || Math.abs((delta % 5_000) - 5_000) < 60) {
          return stamps[i]! % 5_000;
        }
      }
    }
    return null;
  };

  const isTickerCapture = (sentAtPerformanceMs: number) => {
    const phase = tickerPhasePerformanceMs();
    if (phase === null) {
      return false;
    }
    const distance = Math.abs((((sentAtPerformanceMs - phase) % 5_000) + 5_000) % 5_000);
    return distance < 80 || distance > 4_920;
  };

  const waitForOwnCapture = async (triggerPerformanceMs: number) => {
    const deadline = performance.now() + 12_000;
    while (performance.now() < deadline) {
      // Our press sends its XHR between ~0 and ~1.5 s after the trigger (app
      // serialization/dialog wait), so the window is generous — but captures on
      // the ticker grid are excluded, and captures BEFORE the trigger are never
      // ours.
      // Preference order: a capture INSIDE the tight post-trigger window that
      // is NOT on the ticker grid (definitely ours) > any capture in the tight
      // window (ours, even if it happens to sit on the ticker phase) > none.
      const inWindow = xhrCaptures.filter(
        (capture) =>
          capture.sentAtPerformanceMs >= triggerPerformanceMs - 10 &&
          capture.sentAtPerformanceMs <= triggerPerformanceMs + 2_000,
      );
      const candidate =
        inWindow.find((capture) => !isTickerCapture(capture.sentAtPerformanceMs)) ??
        inWindow.at(-1);
      if (candidate && (candidate.serverSecondMs !== null || candidate.fesrecMs !== null)) {
        return candidate;
      }
      await sleep(25);
    }
    return null;
  };

  const waitForServerSecond = async (
    control: SapControl,
    previousServerSecondMs: number | null,
  ) => {
    const deadline = performance.now() + 1_800;
    let latestServerSecondMs: number | null = null;
    while (performance.now() < deadline) {
      latestServerSecondMs = parseServerSecond(readServerMessage(control) ?? "");
      if (latestServerSecondMs !== null && latestServerSecondMs !== previousServerSecondMs) {
        return latestServerSecondMs;
      }
      await sleep(20);
    }
    // The model never refreshed within the deadline — returning the stale second
    // here would corrupt the sample (S from the *previous* probe), void the offset
    // intersection and poison adaptive gap targeting. Fail the probe instead.
    return null;
  };

  // Rejection messages come in two flavors: "지금은 수강신청 시간이 아닙니다"
  // (before 11:00 on the day) and "수강신청 기간이 아닙니다" (wrong date) —
  // both are noise that must never linger over the page. Identify by CONTENT,
  // not title: a real registration-form dialog may also carry "수강신청" in
  // its title and must never be touched.
  const isRejectionMessage = (message: string | null | undefined) =>
    typeof message === "string" && /수강신청\s*(시간|기간)이\s*아닙니다/.test(message);

  const isRejectionDialog = (element: HTMLElement) => isRejectionMessage(element.textContent);

  let lastOverlayFocusTarget: HTMLElement | null = null;
  let overlayFocusOwned = false;
  const trackOverlayFocus = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches?.("input, select, textarea")) {
      lastOverlayFocusTarget = target;
      overlayFocusOwned = true;
    }
  };
  const trackDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    // Shadow pointer events are retargeted to the host. Only an explicit click
    // outside the overlay relinquishes focus ownership; SAP's programmatic
    // BODY/dialog focus changes must not cancel restoration.
    if (target !== host && !target?.closest?.(".sapMDialog")) {
      overlayFocusOwned = false;
    }
  };
  shadow.addEventListener("focusin", trackOverlayFocus);
  document.addEventListener("pointerdown", trackDocumentPointerDown, true);

  const rejectionDialogSeenAt = new WeakMap<HTMLElement, number>();
  const rejectionDismissDelayMs = 1_000;

  const pressRejectionConfirm = (element: HTMLElement) => {
    // Use the dialog's real 확인 action only. Calling Dialog.close() directly
    // bypasses UI5 lifecycle code and can leave the response/loading chain stuck.
    // On this Korean page UI5 renders the 확인 action's DOM text as "accept".
    // Target the semantic dialog end-button class, with text only as fallback.
    const okButton =
      element.querySelector<HTMLButtonElement>("button.sapMDialogEndButton") ??
      Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
        /^(확인|accept|ok)$/i.test(button.textContent?.trim() ?? ""),
      );
    if (!okButton) {
      return false;
    }
    const focusTarget =
      overlayFocusOwned && lastOverlayFocusTarget?.isConnected ? lastOverlayFocusTarget : null;
    const restoreFocus = () => {
      if (focusTarget?.isConnected) {
        focusTarget.focus({ preventScroll: true });
      }
    };
    const dialogControl = getSapControl(element.id);
    if (focusTarget && dialogControl?.attachEventOnce) {
      dialogControl.attachEventOnce("afterClose", () => {
        window.setTimeout(restoreFocus, 0);
      });
    }
    // This page's UI5 button ignores synthetic DOM click/pointer sequences
    // (verified with .click(), dispatchEvent and CDP mouse input). Trigger only
    // the rendered button control's semantic press action; never force-close
    // the dialog, so its application handler/lifecycle still runs normally.
    const buttonControl = getSapControl(okButton.id);
    if (!buttonControl?.firePress) {
      return false;
    }
    buttonControl.firePress();
    // Fallback for UI5 variants that do not emit afterClose on this control.
    if (focusTarget) {
      window.setTimeout(restoreFocus, 700);
    }
    return true;
  };

  const closeNotOpenTimeDialogs = () => {
    const nowMs = performance.now();
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(".sapMDialog[data-sap-ui]"),
    )) {
      const control = getSapControl(element.id);
      const isActuallyOpen = control?.isOpen?.() !== false && element.getClientRects().length > 0;
      if (!isActuallyOpen || !isRejectionDialog(element)) {
        rejectionDialogSeenAt.delete(element);
        continue;
      }
      const seenAtMs = rejectionDialogSeenAt.get(element);
      if (seenAtMs === undefined) {
        rejectionDialogSeenAt.set(element, nowMs);
        continue;
      }
      // Give the app's afterOpen → fn_attachUIUpdated → sevtResolve →
      // zu4aGFwating(false) chain ample time to finish before pressing 확인.
      if (nowMs - seenAtMs < rejectionDismissDelayMs) {
        continue;
      }
      if (pressRejectionConfirm(element)) {
        rejectionDialogSeenAt.delete(element);
      }
    }
  };

  // Do not patch DIALOGMSG.open or close dialogs programmatically. Observe a
  // fully-open rejection dialog, wait for the app lifecycle, then press 확인.
  const dialogWatchdog = () => {
    if (!destroyedRef.value) {
      closeNotOpenTimeDialogs();
    }
  };
  const destroyedRef = { value: false };
  const watchdogTimerId = window.setInterval(dialogWatchdog, 100);

  const waitUntil = async (deadlineMs: number, loopToken: number) => {
    while (probeRunning && loopToken === probeLoopToken) {
      const remainingMs = deadlineMs - performance.now();
      if (remainingMs <= 0) {
        return true;
      }
      await sleep(Math.max(1, remainingMs - 12));
    }
    return false;
  };

  const setProbeStatus = (message: string) => {
    probeStatus.textContent = message;
  };

  const renderPlot = () => {
    const recentSamples = samples.slice(-18);
    if (recentSamples.length === 0) {
      rttPlot.innerHTML =
        '<line class="gridline" x1="0" y1="20" x2="360" y2="20"/><line class="gridline" x1="0" y1="55" x2="360" y2="55"/><text class="empty-plot" x="180" y="42" text-anchor="middle">AWAITING NETWORK SAMPLES</text>';
      return;
    }

    const values = recentSamples.map((sample) => sample.rttMs);
    const plotMedian = median(values);
    const maximum = Math.max(40, ...values) * 1.15;
    const xForIndex = (index: number) =>
      recentSamples.length === 1 ? 180 : 8 + (index / (recentSamples.length - 1)) * 344;
    const yForValue = (value: number) => 70 - Math.min(1, value / maximum) * 61;
    const points = values
      .map((value, index) => `${xForIndex(index).toFixed(1)},${yForValue(value).toFixed(1)}`)
      .join(" ");
    const circles = values
      .map(
        (value, index) =>
          `<circle class="rtt-point" cx="${xForIndex(index).toFixed(1)}" cy="${yForValue(value).toFixed(1)}" r="2.5"/>`,
      )
      .join("");
    const medianY = yForValue(plotMedian).toFixed(1);
    rttPlot.innerHTML = `<line class="gridline" x1="0" y1="9" x2="360" y2="9"/><line class="gridline" x1="0" y1="70" x2="360" y2="70"/><line class="median-line" x1="0" y1="${medianY}" x2="360" y2="${medianY}"/><polyline class="rtt-line" points="${points}"/>${circles}`;
  };

  const renderProbeRows = () => {
    probeRows.replaceChildren();
    for (const sample of [...samples].slice(-6).reverse()) {
      const row = document.createElement("tr");
      const values = [
        String(sample.sequence).padStart(2, "0"),
        formatKoreaTime(sample.serverSecondMs, false),
        formatDuration(sample.rttMs),
        formatDuration(sample.ttfbMs),
        formatSignedDuration(sample.midpointOffsetMs),
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      probeRows.appendChild(row);
    }
  };

  const renderStatistics = () => {
    const statistics = getStatistics();
    sampleCount.textContent = `n = ${samples.length}`;
    if (!statistics) {
      offsetBest.textContent = "—";
      rttMinMetric.textContent = "—";
      oneWayEst.textContent = "—";
      uncertainty.textContent = "—";
      quality.textContent = "CALIBRATING";
    } else {
      offsetBest.textContent = formatSignedDuration(statistics.offsetMs);
      offsetBest.title = `Midpoint median ${formatSignedDuration(statistics.midpointMedianMs)}`;
      rttMinMetric.textContent = formatDuration(statistics.rttMinimumMs);
      rttMinMetric.title = `Median ${formatDuration(statistics.rttMedianMs)} · TTFB min ${formatDuration(statistics.ttfbMinimumMs)} · best ${statistics.bestSampleCount}/${samples.length} samples`;
      oneWayEst.textContent = formatDuration(
        statistics.transitMinimumMs !== null
          ? statistics.transitMinimumMs / 2
          : statistics.rttMinimumMs / 2,
      );
      oneWayEst.title =
        statistics.transitMinimumMs !== null
          ? `Transit min ${formatDuration(statistics.transitMinimumMs)} (TTFB − dwell, from sap-perf-fesrec)`
          : `Arrival window ±${(statistics.rttMinimumMs / 2).toFixed(1)} ms (RTT min / 2)`;
      uncertainty.textContent = `±${statistics.uncertaintyMs.toFixed(1)} ms`;
      uncertainty.title = `raw ±${statistics.rawUncertaintyMs.toFixed(1)} ms · fesrec n=${statistics.fesrecSampleCount}`;
      const estimatedServerEpochMs = epochNow() + statistics.offsetMs;
      serverClock.textContent = formatKoreaTime(estimatedServerEpochMs, true);
      serverDate.textContent = `${formatKoreaDate(estimatedServerEpochMs)} KST · estimated offset ${formatSignedDuration(statistics.offsetMs)}`;
      quality.textContent =
        statistics.uncertaintyMs <= 25
          ? "TIGHT LOCK"
          : statistics.uncertaintyMs <= 80
            ? "LOCKED"
            : statistics.uncertaintyMs <= 200
              ? "TRACKING"
              : "COARSE";
    }
    renderPlot();
    renderProbeRows();
  };

  const performProbe = async () => {
    const control = findProbeControl();
    if (!control) {
      throw new Error("수강신청 진입 컨트롤을 찾지 못했습니다.");
    }

    const previousServerSecondMs = parseServerSecond(readServerMessage(control) ?? "");
    const triggerPerformanceMs = performance.now();
    probeInFlight = true;
    setProbeStatus("Probe in flight…");
    // The resource-timing buffer fills after long sessions and silently drops new
    // entries — waitForProbeResource then times out forever. We only ever need the
    // current probe's entry, so reset the buffer right before firing.
    performance.clearResourceTimings();
    control.firePress?.();

    try {
      const ownCapture = await waitForOwnCapture(triggerPerformanceMs);
      if (!ownCapture) {
        nextProbeAtPerformanceMs = performance.now() + minimumProbeIntervalMs;
        throw new Error("프레스 요청이 전송되지 않았습니다.");
      }
      const resource = await waitForProbeResource(ownCapture.sentAtPerformanceMs);
      if (!resource) {
        nextProbeAtPerformanceMs = performance.now() + minimumProbeIntervalMs;
        throw new Error("서버 응답 타이밍을 찾지 못했습니다.");
      }

      lastRequestStartPerformanceMs = resource.startTime;
      let serverSecondMs = ownCapture.serverSecondMs;
      if (serverSecondMs === null) {
        serverSecondMs = await waitForServerSecond(control, previousServerSecondMs);
      }
      if (serverSecondMs === null) {
        throw new Error("응답에서 서버 시간 문자열을 찾지 못했습니다.");
      }

      const requestStartEpochMs = epochFromPerformance(resource.startTime);
      const responseStartEpochMs = epochFromPerformance(resource.responseStart);
      const responseEndEpochMs = epochFromPerformance(resource.responseEnd);
      // The server stamps its clock before the first response byte is sent, so the
      // read moment is bounded above by responseStart, not responseEnd. Interval
      // width per sample becomes 1000 + TTFB instead of 1000 + RTT.
      const lowerOffsetMs = serverSecondMs - responseStartEpochMs;
      const upperOffsetMs = serverSecondMs + 1_000 - requestStartEpochMs;
      const midpointOffsetMs = (lowerOffsetMs + upperOffsetMs) / 2;

      samples = [
        ...samples,
        {
          sequence: ++probeSequence,
          serverSecondMs,
          requestStartEpochMs,
          responseEndEpochMs,
          rttMs: resource.duration,
          ttfbMs: resource.responseStart - resource.requestStart,
          serverInternalMs: ownCapture.fesrecMs,
          plannedIntervalMs: lastPlannedIntervalMs,
          startDeltaMs: resource.startTime - triggerPerformanceMs,
          lowerOffsetMs,
          upperOffsetMs,
          midpointOffsetMs,
        },
      ].slice(-maximumSamples);

      // Record the AIM MISS of the shot that just completed (diagnostic only —
      // not fed back into aiming; the closed loop created a fixed point).
      if (lastAimTargetPhaseMs !== null && samples.length >= 1) {
        const current = samples.at(-1)!;
        const missMs = wrapPhaseSigned(samplePhase(current) - lastAimTargetPhaseMs);
        phaseAdvanceErrorCount += 1;
        phaseAdvanceErrorMeanMs += (missMs - phaseAdvanceErrorMeanMs) / phaseAdvanceErrorCount;
      }
      lastAimTargetPhaseMs = null;

      const calibrationActive = calibrationShotsRemaining > 0;
      if (calibrationActive) {
        calibrationShotsRemaining -= 1;
      }
      let intervalMs: number;
      if (calibrationActive) {
        // Adaptive from the first shot that has a gap map (≥3 samples); only the
        // first couple of shots fall back to the stagger schedule.
        const aimTargetPhaseMs = computeAdaptiveAimTargetPhaseMs();
        const lastSample = samples.at(-1);
        if (
          (adaptiveCalibration || samples.length >= 3) &&
          aimTargetPhaseMs !== null &&
          lastSample !== undefined
        ) {
          // Pure open-loop: next landing phase ≡ last − spacing, so spacing ≡
          // −(target − last). Escape hatch: if the target would land within 25 ms
          // of the last landing (a fixed point), force a half-ring jump instead.
          let advanceMs = wrapPhase(aimTargetPhaseMs - samplePhase(lastSample));
          if (Math.abs(wrapPhaseSigned(advanceMs)) < 25) {
            advanceMs = 500;
          }
          const jitterMs = wrapPhase(-advanceMs - 60);
          intervalMs = calibrationIntervalMs + jitterMs;
          lastAimTargetPhaseMs = aimTargetPhaseMs;
        } else {
          // First shots with <3 samples: no gap map yet — stagger deterministically.
          const spacingIndex = calibrationShotCount - calibrationShotsRemaining - 1;
          intervalMs = calibrationIntervalMs + (calibrationJitterScheduleMs[spacingIndex] ?? 0);
        }
        if (calibrationShotsRemaining === 0) {
          adaptiveCalibration = false;
          lastCalibrationEndAtPerformanceMs = performance.now();
        }
      } else {
        intervalMs = probeIntervalsMs[intervalIndex % probeIntervalsMs.length] ?? 3_137;
        intervalIndex += 1;
      }
      nextProbeAtPerformanceMs = lastRequestStartPerformanceMs + intervalMs;
      lastPlannedIntervalMs = intervalMs;
      setProbeStatus(
        calibrationActive
          ? `Probe #${probeSequence} accepted · FAST CAL ${calibrationShotsRemaining} left`
          : `Probe #${probeSequence} accepted`,
      );
      renderStatistics();
    } finally {
      probeInFlight = false;
      await sleep(0);
      closeNotOpenTimeDialogs();
      if (!probeRunning) {
        setProbeStatus("Probes paused");
      }
    }
  };

  const runProbeLoop = async (loopToken: number) => {
    while (probeRunning && loopToken === probeLoopToken) {
      const latestStatistics = getStatistics();
      if (
        !probeInFlight &&
        calibrationShotsRemaining === 0 &&
        samples.length >= 6 &&
        latestStatistics &&
        latestStatistics.uncertaintyMs > recalibrationTargetMs &&
        performance.now() - lastCalibrationEndAtPerformanceMs > 4_000
      ) {
        // Keep firing: every shot is an independent chance to split the largest
        // remaining gap, and samples only ever tighten the intersection. Even past
        // the landing-dispersion floor, more rounds keep converging (probabilistically) — no backoff.
        calibrationShotsRemaining = adaptiveShotCount;
        adaptiveCalibration = true;
      }
      const minimumGapMs =
        calibrationShotsRemaining > 0 ? calibrationIntervalMs : minimumProbeIntervalMs;
      const hardGateMs = lastRequestStartPerformanceMs + minimumGapMs;
      const deadlineMs = Math.max(nextProbeAtPerformanceMs, hardGateMs);
      const shouldContinue = await waitUntil(deadlineMs, loopToken);
      if (!shouldContinue) {
        return;
      }

      try {
        await performProbe();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Probe failed";
        setProbeStatus(probeRunning ? message : "Probes paused");
        nextProbeAtPerformanceMs = performance.now() + minimumProbeIntervalMs;
      }
    }
  };

  const setProbeRunning = (running: boolean) => {
    if (
      running &&
      snipePlan?.mode === "target" &&
      (snipePlan.phase === "settling" || snipePlan.phase === "frozen")
    ) {
      setProbeStatus("Probes locked: sniper timing is frozen");
      return;
    }
    if (probeRunning === running) {
      return;
    }
    probeRunning = running;
    probeLoopToken += 1;
    toggleProbe.textContent = running ? "Pause probes" : "Resume probes";
    activityMark.classList.toggle("paused", !running);
    if (running) {
      setProbeStatus("Scheduling next probe…");
      void runProbeLoop(probeLoopToken);
    } else {
      setProbeStatus(probeInFlight ? "Paused · current request finishing…" : "Probes paused");
    }
  };

  type SnipePlan = {
    targetEpochMs: number;
    aimEpochMs: number;
    aimOffsetMs: number;
    sendAtEpochMs: number;
    count: number;
    gapMs: number;
    offsetMs: number;
    pathCorrectionMs: number;
    freezeLeadMs: number;
    freezeAtEpochMs: number;
    phase: "tracking" | "settling" | "frozen";
    mode: "target" | "manual";
  };

  let snipePlan: SnipePlan | null = null;
  let snipeFiring = false;
  let snipeToken = 0;

  const parseTargetTimeKst = (raw: string) => {
    const match = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?$/);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? 0);
    const milliseconds = Number((match[4] ?? "0").padEnd(3, "0"));
    if (hours > 23 || minutes > 59 || seconds > 59) {
      return null;
    }
    const nowEpochMs = epochNow();
    const koreaNow = new Date(nowEpochMs + 9 * 60 * 60 * 1_000);
    const candidateMs = Date.UTC(
      koreaNow.getUTCFullYear(),
      koreaNow.getUTCMonth(),
      koreaNow.getUTCDate(),
      hours - 9,
      minutes,
      seconds,
      milliseconds,
    );
    return candidateMs > nowEpochMs + 2_000 ? candidateMs : candidateMs + 86_400_000;
  };

  const parseSnipeAimOffsetMs = (raw: string, uncertaintyMs: number) => {
    const normalized = raw.trim().toLowerCase().replaceAll("−", "-");
    if (normalized === "u" || normalized === "+u") {
      return uncertaintyMs;
    }
    if (normalized === "-u") {
      return -uncertaintyMs;
    }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
      return null;
    }
    const value = Number(normalized);
    return Number.isFinite(value) && Math.abs(value) <= 999 ? value : null;
  };

  const describeSnipePlan = (plan: SnipePlan) => {
    if (plan.mode === "manual") {
      return [
        `TARGET ${formatKoreaTime(plan.targetEpochMs, true)} KST · immediate manual burst`,
        `${plan.count} shots × ${plan.gapMs} ms gap`,
      ].join("\u2028");
    }
    const phaseLine =
      plan.phase === "tracking"
        ? `SYNCING · auto-freeze ${(plan.freezeLeadMs / 1_000).toFixed(0)} s before AIM`
        : plan.phase === "settling"
          ? "FREEZING · waiting for the last probe/dialog to settle"
          : "FROZEN · probes stopped; timing locked";
    return [
      `TARGET ${formatKoreaTime(plan.targetEpochMs, true)} KST · OFF ${formatSignedDuration(plan.aimOffsetMs)}`,
      `AIM ${formatKoreaTime(plan.aimEpochMs, true)} KST · arrival ≈ aim`,
      `SEND ${formatKoreaTime(plan.sendAtEpochMs, true)} local · clock ${formatSignedDuration(plan.offsetMs)} · path ${formatDuration(plan.pathCorrectionMs)}`,
      phaseLine,
      `${plan.count} shots × ${plan.gapMs} ms gap`,
    ].join("\u2028");
  };

  const updateSnipeCountdown = () => {
    if (!snipePlan) {
      return;
    }
    if (snipePlan.phase === "tracking") {
      const freezeRemainingMs = snipePlan.freezeAtEpochMs - epochNow();
      snipeCountdown.textContent =
        freezeRemainingMs > 0 ? `SYNC · F−${(freezeRemainingMs / 1_000).toFixed(3)} s` : "FREEZING";
      return;
    }
    if (snipePlan.phase === "settling") {
      snipeCountdown.textContent = "QUIETING";
      return;
    }
    const remainingMs = snipePlan.sendAtEpochMs - epochNow();
    snipeCountdown.textContent =
      remainingMs > 0 ? `T−${(remainingMs / 1_000).toFixed(3)} s` : "FIRING";
  };

  const preciseWaitUntil = async (
    deadlineEpochMs: number,
    isCancelled: () => boolean = () => false,
  ) => {
    let remainingMs = deadlineEpochMs - epochNow();
    while (remainingMs > 60) {
      if (isCancelled()) {
        return false;
      }
      // Cap long sleeps so Disarm becomes effective within 250 ms instead of
      // leaving an hours-long precision wait alive until the original target.
      await sleep(Math.min(250, remainingMs - 40));
      remainingMs = deadlineEpochMs - epochNow();
    }
    while (remainingMs > 6) {
      if (isCancelled()) {
        return false;
      }
      await sleep(2);
      remainingMs = deadlineEpochMs - epochNow();
    }
    // Busy-spin the final few milliseconds for sub-millisecond accuracy.
    while (epochNow() < deadlineEpochMs) {
      if (isCancelled()) {
        return false;
      }
      performance.now();
    }
    return !isCancelled();
  };

  const refreshSnipeTiming = (
    plan: SnipePlan,
    statistics: NonNullable<ReturnType<typeof getStatistics>>,
  ) => {
    // Exactly mirror Test: estimate forward transit, then center the server's
    // 0–40 ms read window on AIM. OFF=0 therefore means arrival/read ≈ TGT.
    const forwardTransitMs =
      statistics.transitMinimumMs !== null ? statistics.transitMinimumMs / 2 : 0;
    plan.offsetMs = statistics.offsetMs;
    plan.pathCorrectionMs = forwardTransitMs + readMarginMs / 2;
    plan.sendAtEpochMs = plan.aimEpochMs - plan.offsetMs - plan.pathCorrectionMs;
    plan.freezeAtEpochMs = plan.aimEpochMs - plan.offsetMs - plan.freezeLeadMs;
  };

  const fireSnipeBurst = async (plan: SnipePlan, token: number) => {
    snipeFiring = true;
    let fired = 0;
    try {
      for (let shot = 0; shot < plan.count; shot += 1) {
        const reachedDeadline = await preciseWaitUntil(
          plan.sendAtEpochMs + shot * plan.gapMs,
          () => token !== snipeToken,
        );
        if (!reachedDeadline || token !== snipeToken) {
          return;
        }
        const control = findProbeControl();
        if (!control) {
          throw new Error("수강신청 진입 컨트롤을 찾지 못했습니다.");
        }
        control.firePress?.();
        fired += 1;
      }
      snipeCountdown.textContent = `DONE · ${fired} shots`;
      snipePlanElement.textContent = `Burst complete — ${fired} shots. Check the page for the registration dialog.`;
    } catch (error) {
      snipeCountdown.textContent = `ABORT · ${fired} fired`;
      snipePlanElement.textContent = error instanceof Error ? error.message : "Snipe failed";
    } finally {
      snipeFiring = false;
      snipePlan = null;
      snipeArm.textContent = "Arm sniper";
    }
  };

  const readBurstSettings = () => ({
    count: Math.min(20, Math.max(1, Math.floor(Number(snipeCountInput.value) || 1))),
    gapMs: Math.min(500, Math.max(10, Math.floor(Number(snipeGapInput.value) || 35))),
  });

  const readFreezeLeadMs = () => {
    const seconds = Math.min(20, Math.max(10, Math.floor(Number(snipeFreezeInput.value) || 15)));
    snipeFreezeInput.value = String(seconds);
    return seconds * 1_000;
  };

  const waitForSnipeQuiet = async (plan: SnipePlan, token: number) => {
    const latestSafeEpochMs = plan.sendAtEpochMs - 1_000;
    const deadlinePerformanceMs =
      performance.now() + Math.min(4_000, Math.max(0, latestSafeEpochMs - epochNow()));
    while (token === snipeToken && probeInFlight && performance.now() < deadlinePerformanceMs) {
      await sleep(25);
    }
    // A response can schedule DIALOGMSG.open after probeInFlight clears. Give
    // that UI5 lifecycle time to open, auto-confirm and remove its block layer.
    const lifecycleWaitUntilMs = Math.min(deadlinePerformanceMs, performance.now() + 1_500);
    while (token === snipeToken && performance.now() < lifecycleWaitUntilMs) {
      await sleep(25);
    }
    while (token === snipeToken && performance.now() < deadlinePerformanceMs) {
      const blockLayer = document.querySelector<HTMLElement>("#sap-ui-blocklayer-popup");
      if (!blockLayer || blockLayer.getClientRects().length === 0) {
        break;
      }
      await sleep(25);
    }
    return token === snipeToken;
  };

  const runArmedSnipe = async (plan: SnipePlan, token: number) => {
    while (token === snipeToken && snipePlan === plan) {
      const statistics = getStatistics();
      if (statistics?.hasIntersection) {
        refreshSnipeTiming(plan, statistics);
        snipePlanElement.textContent = describeSnipePlan(plan);
      }
      const remainingToFreezeMs = plan.freezeAtEpochMs - epochNow();
      if (remainingToFreezeMs <= 0) {
        break;
      }
      await sleep(Math.min(250, Math.max(10, remainingToFreezeMs)));
    }
    if (token !== snipeToken || snipePlan !== plan) {
      return;
    }

    plan.phase = "settling";
    setProbeRunning(false);
    snipePlanElement.textContent = describeSnipePlan(plan);
    if (!(await waitForSnipeQuiet(plan, token)) || snipePlan !== plan) {
      return;
    }

    const finalStatistics = getStatistics();
    if (finalStatistics?.hasIntersection) {
      refreshSnipeTiming(plan, finalStatistics);
    }
    plan.phase = "frozen";
    snipePlanElement.textContent = describeSnipePlan(plan);
    if (plan.sendAtEpochMs - epochNow() < 1_000) {
      snipePlan = null;
      snipeArm.textContent = "Arm sniper";
      snipeCountdown.textContent = "ABORTED";
      snipePlanElement.textContent = "Freeze completed too late — request was not fired.";
      return;
    }
    await fireSnipeBurst(plan, token);
  };

  snipeArm.addEventListener("click", () => {
    // Disarm works in every phase: live-sync tracking, quiet settling, or the
    // final precision wait. Token cancellation prevents any pending shot.
    if (snipePlan) {
      snipeToken += 1;
      snipePlan = null;
      snipeArm.textContent = "Arm sniper";
      snipeCountdown.textContent = "STANDBY";
      snipePlanElement.textContent = probeRunning
        ? "Sniper disarmed — probes continue syncing."
        : "Sniper disarmed — probes stay paused until resumed.";
      return;
    }
    if (snipeFiring) {
      return;
    }
    const statistics = getStatistics();
    if (!statistics || !statistics.hasIntersection) {
      snipePlanElement.textContent =
        "Cannot arm: offset not locked yet. Keep probing until LOCKED or better.";
      return;
    }
    const targetEpochMs = parseTargetTimeKst(snipeTargetInput.value);
    if (targetEpochMs === null) {
      snipePlanElement.textContent =
        "Cannot parse target — use HH:MM, HH:MM:SS or HH:MM:SS.mmm (KST).";
      return;
    }
    const aimOffsetMs = parseSnipeAimOffsetMs(snipeOffsetInput.value, statistics.uncertaintyMs);
    if (aimOffsetMs === null) {
      snipePlanElement.textContent =
        "Cannot parse OFF — use milliseconds from −999 to +999 (e.g. −30, +10) or −u/+u.";
      return;
    }
    const aimEpochMs = targetEpochMs + aimOffsetMs;
    const { count, gapMs } = readBurstSettings();
    const freezeLeadMs = readFreezeLeadMs();
    const plan: SnipePlan = {
      targetEpochMs,
      aimEpochMs,
      aimOffsetMs,
      sendAtEpochMs: aimEpochMs,
      count,
      gapMs,
      offsetMs: statistics.offsetMs,
      pathCorrectionMs: 0,
      freezeLeadMs,
      freezeAtEpochMs: aimEpochMs - statistics.offsetMs - freezeLeadMs,
      phase: "tracking",
      mode: "target",
    };
    refreshSnipeTiming(plan, statistics);
    if (plan.sendAtEpochMs - epochNow() < 1_000) {
      snipePlanElement.textContent = "Send time is under 1 s away — choose a later target.";
      return;
    }
    snipePlan = plan;
    snipeArm.textContent = "Disarm";
    setProbeRunning(true);
    snipePlanElement.textContent = describeSnipePlan(plan);
    void runArmedSnipe(plan, ++snipeToken);
  });

  snipeNow.addEventListener("click", () => {
    if (snipeFiring || snipePlan) {
      return;
    }
    const { count, gapMs } = readBurstSettings();
    const nowEpochMs = epochNow();
    const plan: SnipePlan = {
      targetEpochMs: nowEpochMs,
      aimEpochMs: nowEpochMs,
      aimOffsetMs: 0,
      sendAtEpochMs: nowEpochMs,
      count,
      gapMs,
      offsetMs: 0,
      pathCorrectionMs: 0,
      freezeLeadMs: 0,
      freezeAtEpochMs: nowEpochMs,
      phase: "frozen",
      mode: "manual",
    };
    snipePlanElement.textContent = describeSnipePlan(plan);
    void fireSnipeBurst(plan, ++snipeToken);
  });

  let testRunning = false;
  let testToken = 0;

  const appendTestRow = (cells: string[]) => {
    const row = document.createElement("tr");
    for (const value of cells) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }
    testRows.appendChild(row);
  };

  const runSnipeTest = async (token: number) => {
    const initialStatistics = getStatistics();
    if (!initialStatistics || !initialStatistics.hasIntersection) {
      testStatusElement.textContent = "Cannot test: offset not locked yet.";
      return;
    }
    // Whole-second grid: every shot aims exactly at a second boundary X.000 —
    // no millisecond offsets. The first boundary lands ~20 s out, then one shot
    // per spacing, all on the second grid.
    const anchorEpochMs = Math.ceil((epochNow() + 20_000) / 1_000) * 1_000;
    const spacingMs =
      Math.min(60, Math.max(8, Math.floor(Number(testSpacingInput.value) || 12))) * 1_000;
    const uncertaintyMs = initialStatistics.uncertaintyMs;
    const offsets = [
      { label: `−u (${Math.round(uncertaintyMs)})`, ms: -uncertaintyMs },
      { label: "−30", ms: -30 },
      { label: "−10", ms: -10 },
      { label: "±0", ms: 0 },
      { label: "+10", ms: 10 },
      { label: "+30", ms: 30 },
      { label: `+u (+${Math.round(uncertaintyMs)})`, ms: uncertaintyMs },
    ];

    testRunning = true;
    testRunButton.textContent = "Running…";
    testRows.replaceChildren();
    const probesWereRunning = probeRunning;
    setProbeRunning(false);
    const errors: number[] = [];
    let inSecondCount = 0;
    let verdictPassed = 0;
    let verdictTotal = 0;

    try {
      for (let index = 0; index < offsets.length; index += 1) {
        const offset = offsets[index]!;
        const boundaryEpochMs = anchorEpochMs + index * spacingMs;
        const aimEpochMs = boundaryEpochMs + offset.ms;
        testStatusElement.textContent = `Shot ${index + 1}/${offsets.length} · aim ${formatKoreaTime(aimEpochMs, true)} (${offset.label})`;
        const statistics = getStatistics() ?? initialStatistics;
        const oneWayMs = statistics.transitMinimumMs !== null ? statistics.transitMinimumMs / 2 : 0;
        // Send timing mirrors the sniper exactly: offset + forward transit +
        // half the read margin (read happens between arrival and arrival+40 ms).
        const sendAtEpochMs = aimEpochMs - statistics.offsetMs - oneWayMs - readMarginMs / 2;

        await preciseWaitUntil(sendAtEpochMs);
        if (token !== testToken) {
          testStatusElement.textContent = "Test aborted.";
          return;
        }

        performance.clearResourceTimings();
        const triggerPerformanceMs = performance.now();
        const control = findProbeControl();
        if (!control) {
          throw new Error("수강신청 진입 컨트롤을 찾지 못했습니다.");
        }
        control.firePress?.();

        const ownCapture = await waitForOwnCapture(triggerPerformanceMs);
        const resource = ownCapture
          ? await waitForProbeResource(ownCapture.sentAtPerformanceMs)
          : null;
        if (!ownCapture || !resource) {
          appendTestRow([
            offset.label,
            formatKoreaTime(aimEpochMs, true),
            "—",
            "—",
            !ownCapture ? "FAIL(no-xhr)" : "FAIL(no-resource)",
            "—",
          ]);
          continue;
        }

        const postStatistics = getStatistics() ?? initialStatistics;
        const postOneWayMs =
          postStatistics.transitMinimumMs !== null ? postStatistics.transitMinimumMs / 2 : 0;
        // Server-clock time when the request hit the wire at the server: our
        // wire-start + offset + one-way forward estimate.
        // Arrival judged on the SAME event the server's second S certifies: the
        // clock-read moment. The offset model already anchors to read-time
        // (read sits between arrival and arrival+margin), so folding half the
        // read margin into the arrival estimate keeps Err and the S-verdict
        // describing one event instead of two subtly different ones.
        const arrivalEpochMs =
          epochFromPerformance(resource.startTime) +
          postStatistics.offsetMs +
          postOneWayMs +
          readMarginMs / 2;
        const errorMs = arrivalEpochMs - aimEpochMs;
        errors.push(errorMs);
        // Each shot's boundary T = aim − offset (a whole second X.000 on the
        // grid). The server's second signs the verdict: IN (S = T) means the
        // request crossed its boundary, EARLY (S = T−1) means it fell short.
        // Expectations: negative offsets must fall short, positive must cross;
        // shots within ±u of the boundary are edge cases (either side is noise).
        const serverSecondMs = ownCapture.serverSecondMs;
        const arrivedInTargetSecond = serverSecondMs !== null && serverSecondMs === boundaryEpochMs;
        const isEdgeCase = Math.abs(offset.ms) <= uncertaintyMs;
        const expectedIn = offset.ms > 0;
        const verdictOk = arrivedInTargetSecond === expectedIn;
        if (arrivedInTargetSecond) {
          inSecondCount += 1;
        }
        if (!isEdgeCase) {
          verdictTotal += 1;
          if (verdictOk) {
            verdictPassed += 1;
          }
        }
        // S-anchored arrival display, consistent with the verdict BY CONSTRUCTION:
        // display = S + clamp(rawDelta, 0, 999) with rawDelta = arrival − S (no
        // ±500 pre-wrap — the old double-wrap rendered EARLY shots as X−2 .001).
        // IN renders inside second S (X.0xx); EARLY (S = T−1) with a read ~30 ms
        // before T renders as X−1 .9xx — matching its verdict.
        let arrivalDisplayEpochMs = arrivalEpochMs;
        if (serverSecondMs !== null) {
          const rawDeltaMs = arrivalEpochMs - serverSecondMs;
          const clampedMs = Math.max(0, Math.min(999, rawDeltaMs));
          arrivalDisplayEpochMs = serverSecondMs + clampedMs;
        }
        appendTestRow([
          offset.label,
          formatKoreaTime(boundaryEpochMs, true),
          formatKoreaTime(arrivalDisplayEpochMs, true),
          formatSignedDuration(errorMs),
          serverSecondMs === null
            ? "—"
            : isEdgeCase
              ? arrivedInTargetSecond
                ? "IN~"
                : "EARLY~"
              : arrivedInTargetSecond
                ? verdictOk
                  ? "IN✓"
                  : "IN✗"
                : verdictOk
                  ? "EARLY✓"
                  : "EARLY✗",
          formatDuration(resource.duration),
        ]);
      }

      if (errors.length > 0) {
        const meanError = errors.reduce((sum, value) => sum + value, 0) / errors.length;
        const maxAbsError = Math.max(...errors.map((value) => Math.abs(value)));
        testStatusElement.textContent = `verdict ${verdictPassed}/${verdictTotal} (−30/−10 must be EARLY, +30/+u must be IN) · IN ${inSecondCount}/${errors.length} · mean ${formatSignedDuration(meanError)} · max |err| ${maxAbsError.toFixed(1)} ms`;
      } else {
        testStatusElement.textContent = "All shots failed — check probe status.";
      }
    } finally {
      testRunning = false;
      testRunButton.textContent = "Run test";
      if (probesWereRunning && !destroyed) {
        setProbeRunning(true);
      }
    }
  };

  testRunButton.addEventListener("click", () => {
    if (testRunning) {
      return;
    }
    void runSnipeTest(++testToken);
  });

  const updateClock = () => {
    const statistics = getStatistics();
    if (statistics) {
      const estimatedServerEpochMs = epochNow() + statistics.offsetMs;
      serverClock.textContent = formatKoreaTime(estimatedServerEpochMs, true);
      serverDate.textContent = `${formatKoreaDate(estimatedServerEpochMs)} KST · estimated offset ${formatSignedDuration(statistics.offsetMs)}`;
    }

    updateSnipeCountdown();
    if (snipePlan?.mode === "target" && snipePlan.phase === "tracking") {
      const probeRemainingMs = Math.max(0, nextProbeAtPerformanceMs - performance.now());
      const freezeRemainingMs = Math.max(0, snipePlan.freezeAtEpochMs - epochNow());
      nextProbe.textContent = probeRunning
        ? `NEXT ${(probeRemainingMs / 1_000).toFixed(1)}s · FREEZE T−${(freezeRemainingMs / 1_000).toFixed(1)}s`
        : `PROBES PAUSED · FREEZE T−${(freezeRemainingMs / 1_000).toFixed(1)}s`;
    } else if (snipePlan) {
      const snipeRemainingMs = snipePlan.sendAtEpochMs - epochNow();
      nextProbe.textContent = `${snipePlan.phase === "settling" ? "QUIETING" : "FROZEN"} · FIRE T−${Math.max(0, snipeRemainingMs / 1_000).toFixed(1)}s`;
    } else if (probeRunning) {
      const remainingMs = Math.max(0, nextProbeAtPerformanceMs - performance.now());
      const mode =
        calibrationShotsRemaining > 0
          ? `${adaptiveCalibration ? "AIM CAL" : "CAL"} ${calibrationShotsRemaining} left`
          : "SWEEP";
      nextProbe.textContent = `NEXT ${(remainingMs / 1_000).toFixed(1)}s · ${mode}`;
    } else {
      nextProbe.textContent = "PAUSED · NO NEW PROBES";
    }
    animationFrameId = requestAnimationFrame(updateClock);
  };

  const setActiveTab = (name: string) => {
    for (const button of Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-tab]"))) {
      button.setAttribute("aria-selected", String(button.dataset.tab === name));
    }
    for (const panel of Array.from(shadow.querySelectorAll<HTMLElement>("[data-panel]"))) {
      panel.hidden = panel.dataset.panel !== name;
    }
  };

  for (const button of Array.from(shadow.querySelectorAll<HTMLButtonElement>("[data-tab]"))) {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab ?? "clock"));
  }

  const setOverlayInputValue = (inputId: string, value: string) => {
    const input = shadow.querySelector<HTMLInputElement>(`#${inputId}`);
    if (!input) {
      return;
    }
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  for (const sourceInputIds of [tab1SourceInputIds, tab2SourceInputIds]) {
    sourceInputIds.forEach((sourceInputId, startIndex) => {
      shadow
        .querySelector<HTMLInputElement>(`#${sourceInputId}`)
        ?.addEventListener("paste", (event) => {
          const pastedValues = (event.clipboardData?.getData("text") ?? "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          if (pastedValues.length <= 1) {
            return;
          }
          event.preventDefault();
          sourceInputIds.slice(startIndex).forEach((targetId, offset) => {
            setOverlayInputValue(targetId, pastedValues[offset] ?? "");
          });
        });
    });
  }

  for (const runButton of Array.from(
    shadow.querySelectorAll<HTMLButtonElement>("[data-run-macro]"),
  )) {
    runButton.addEventListener("click", () => {
      const tabIndex = Number(runButton.dataset.runMacro);
      const sourceInputIds = tabIndex === 1 ? tab2SourceInputIds : tab1SourceInputIds;
      const sourceValues = sourceInputIds.map(
        (inputId) => shadow.querySelector<HTMLInputElement>(`#${inputId}`)?.value ?? "",
      );
      const parsedValues = sourceValues.join(" ").trim().split(/\s+/).filter(Boolean);
      const missingTargetIds: string[] = [];

      targetInputIds.forEach((targetId, index) => {
        const targetInput = document.getElementById(targetId);
        if (!(targetInput instanceof HTMLInputElement)) {
          missingTargetIds.push(targetId);
          return;
        }
        targetInput.focus();
        targetInput.value = parsedValues[index] ?? "";
        targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        targetInput.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const status = requireElement<HTMLElement>(`[data-macro-status="${tabIndex}"]`);
      status.textContent =
        missingTargetIds.length > 0
          ? `입력칸을 찾지 못했습니다: ${missingTargetIds.join(", ")}`
          : "Applied to all six registration inputs.";
    });
  }

  toggleProbe.addEventListener("click", () => setProbeRunning(!probeRunning));
  resetSamples.addEventListener("click", () => {
    samples = [];
    probeSequence = 0;
    calibrationShotsRemaining = calibrationShotCount;
    adaptiveCalibration = false;
    renderStatistics();
    serverClock.textContent = "--:--:--.---";
    serverDate.textContent = "Waiting for the first server sample";
    setProbeStatus(probeRunning ? "Samples cleared; probing continues" : "Samples cleared");
  });

  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const moveOverlay = (event: PointerEvent) => {
    if (!dragging) {
      return;
    }
    host.style.left = `${Math.max(6, event.clientX - dragOffsetX)}px`;
    host.style.top = `${Math.max(6, event.clientY - dragOffsetY)}px`;
    host.style.right = "auto";
  };
  const stopDragging = () => {
    dragging = false;
  };

  dragHandle.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest("button")) {
      return;
    }
    const bounds = host.getBoundingClientRect();
    dragging = true;
    dragOffsetX = event.clientX - bounds.left;
    dragOffsetY = event.clientY - bounds.top;
  });
  window.addEventListener("pointermove", moveOverlay);

  // Fence our events from the page's UI5 handlers — BUBBLE phase only: the
  // event still reaches its target (tabs, inputs, drag) and is only stopped
  // from leaking up to the document, where SAP delegation steals focus.
  // (A capture-phase fence here blocked descent into the shadow tree and
  // killed every inner interaction — tab clicks included.)
  for (const eventType of [
    "pointerdown",
    "mousedown",
    "mouseup",
    "click",
    "touchstart",
    "focusin",
  ]) {
    host.addEventListener(eventType, (event) => event.stopPropagation());
  }
  host.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches?.("input, select, textarea")) {
        return;
      }
      // UI5 document-capture handlers steal focus AFTER our microtask — fight
      // back with a short reassertion window: refocus every 30 ms for 600 ms.
      // Any one-shot theft loses; typing lands in the input.
      target.focus();
      const reassertEndMs = performance.now() + 600;
      const reassertInterval = window.setInterval(() => {
        if (performance.now() > reassertEndMs || !target.isConnected) {
          window.clearInterval(reassertInterval);
          return;
        }
        if (shadow.activeElement !== target) {
          target.focus();
        }
      }, 30);
    },
    { capture: true },
  );
  window.addEventListener("pointerup", stopDragging);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    destroyedRef.value = true;
    window.clearInterval(watchdogTimerId);
    probeRunning = false;
    probeLoopToken += 1;
    snipeToken += 1;
    snipePlan = null;
    testToken += 1;
    XMLHttpRequest.prototype.open = originalXhrOpen;
    XMLHttpRequest.prototype.send = originalXhrSend;
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener("pointermove", moveOverlay);
    window.removeEventListener("pointerup", stopDragging);
    document.removeEventListener("pointerdown", trackDocumentPointerDown, true);
    shadow.removeEventListener("focusin", trackOverlayFocus);
    host.remove();
    if (albatrossWindow.__ALBATROSS_CONTROLLER__ === controller) {
      delete albatrossWindow.__ALBATROSS_CONTROLLER__;
    }
  };
  const controller: OverlayController = {
    destroy,
    pause: () => setProbeRunning(false),
  };
  albatrossWindow.__ALBATROSS_CONTROLLER__ = controller;
  albatrossWindow.__ALBATROSS_SAMPLES__ = () => [...samples];
  closeButton.addEventListener("click", destroy);

  renderStatistics();
  animationFrameId = requestAnimationFrame(updateClock);
  setProbeRunning(true);
})();
