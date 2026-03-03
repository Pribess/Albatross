(() => {
  const id = "__MY_MACRO_OVERLAY__";
  const sourceValuesStorageKey = "__ALBATROSS_SOURCE_VALUES__";
  const sourceInputIds = ["input1", "input2", "input3", "input4", "input5", "input6"];
  const targetInputIds = [
    "__input6-__list0-0-inner",
    "__input6-__list0-1-inner",
    "__input6-__list0-2-inner",
    "__input6-__list0-3-inner",
    "__input6-__list0-4-inner",
    "__input6-__list0-5-inner",
  ];

  const old = document.getElementById(id);
  if (old) {
    old.remove();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.style.cssText =
    "position: fixed;" +
    "top: 40px;" +
    "right: 40px;" +
    "width: 260px;" +
    "background: rgba(20,20,20,0.95);" +
    "color: #fff;" +
    "padding: 12px;" +
    "border-radius: 12px;" +
    "font-family: -apple-system, BlinkMacSystemFont, sans-serif;" +
    "z-index: 2147483647;" +
    "box-shadow: 0 10px 30px rgba(0,0,0,0.4);" +
    "backdrop-filter: blur(8px);" +
    "cursor: move;";

  overlay.innerHTML =
    '<div style="font-weight:600;margin-bottom:8px;">' +
    "Albatross" +
    '<button id="closeBtn" style="float:right;background:none;border:none;color:#fff;cursor:pointer;">' +
    "✕" +
    "</button>" +
    "</div>" +
    '<div style="display:grid;gap:6px;margin-bottom:10px;">' +
    '<input id="input1" placeholder="Input 1" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input2" placeholder="Input 2" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input3" placeholder="Input 3" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input4" placeholder="Input 4" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input5" placeholder="Input 5" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input6" placeholder="Input 6" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    "</div>" +
    '<button id="runBtn" style="width:100%;padding:6px;border-radius:6px;border:none;background:#3b82f6;color:white;cursor:pointer;">' +
    "Run" +
    "</button>" +
    '<div id="statusMsg" style="margin-top:8px;min-height:16px;color:#ef4444;font-size:12px;"></div>';

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>("#closeBtn");
  const runBtn = overlay.querySelector<HTMLButtonElement>("#runBtn");
  const statusMsg = overlay.querySelector<HTMLDivElement>("#statusMsg");
  const sourceInputs = sourceInputIds
    .map((sourceInputId) => overlay.querySelector<HTMLInputElement>(`#${sourceInputId}`))
    .filter((sourceInput): sourceInput is HTMLInputElement => sourceInput !== null);

  const setStatusMessage = (message: string) => {
    if (statusMsg) {
      statusMsg.textContent = message;
    }
  };

  const loadSavedSourceValues = () => {
    let rawValues = "";

    try {
      rawValues = localStorage.getItem(sourceValuesStorageKey) ?? "";
    } catch {
      setStatusMessage("저장된 값을 읽지 못했습니다.");
      return;
    }

    if (!rawValues) {
      return;
    }

    let parsedValues: unknown = null;

    try {
      parsedValues = JSON.parse(rawValues);
    } catch {
      setStatusMessage("저장된 값 형식이 올바르지 않습니다.");
      return;
    }

    if (!Array.isArray(parsedValues)) {
      return;
    }

    sourceInputs.forEach((sourceInput, index) => {
      const parsedValue = parsedValues[index];

      if (typeof parsedValue === "string") {
        sourceInput.value = parsedValue;
      }
    });
  };

  const saveSourceValues = () => {
    const values = sourceInputs.map((sourceInput) => sourceInput.value);

    try {
      localStorage.setItem(sourceValuesStorageKey, JSON.stringify(values));
    } catch {
      setStatusMessage("값을 저장하지 못했습니다.");
    }

    return values;
  };

  loadSavedSourceValues();

  sourceInputs.forEach((sourceInput) => {
    sourceInput.addEventListener("input", () => {
      saveSourceValues();
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== sourceValuesStorageKey) {
      return;
    }

    loadSavedSourceValues();
  });

  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.remove();
    };
  }

  if (runBtn) {
    runBtn.onclick = () => {
      setStatusMessage("");

      const sourceValues = saveSourceValues();
      const parsedValues = sourceValues
        .join(" ")
        .trim()
        .split(/\s+/)
        .filter((value) => value.length > 0);

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

      if (statusMsg && missingTargetIds.length > 0) {
        setStatusMessage(`입력칸을 찾지 못했습니다: ${missingTargetIds.join(", ")}`);
      }
    };
  }

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  overlay.addEventListener("mousedown", (event) => {
    isDragging = true;
    offsetX = event.clientX - overlay.offsetLeft;
    offsetY = event.clientY - overlay.offsetTop;
  });

  document.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }

    overlay.style.left = `${event.clientX - offsetX}px`;
    overlay.style.top = `${event.clientY - offsetY}px`;
    overlay.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });
})();
