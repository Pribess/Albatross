(() => {
  const id = "__MY_MACRO_OVERLAY__";
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
    '<div style="display:flex;gap:6px;margin-bottom:8px;">' +
    '<button id="tab1Btn" style="flex:1;padding:6px;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;">Tab 1</button>' +
    '<button id="tab2Btn" style="flex:1;padding:6px;border-radius:6px;border:none;background:#1f2937;color:#fff;cursor:pointer;">Tab 2</button>' +
    "</div>" +
    '<div style="font-weight:600;margin-bottom:8px;">' +
    "Albatross" +
    '<button id="closeBtn" style="float:right;background:none;border:none;color:#fff;cursor:pointer;">' +
    "✕" +
    "</button>" +
    "</div>" +
    '<div id="tab1Fields" style="display:grid;gap:6px;margin-bottom:10px;">' +
    '<input id="input1" placeholder="Input 1" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input2" placeholder="Input 2" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input3" placeholder="Input 3" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input4" placeholder="Input 4" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input5" placeholder="Input 5" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input6" placeholder="Input 6" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    "</div>" +
    '<div id="tab2Fields" style="display:none;gap:6px;margin-bottom:10px;">' +
    '<input id="input7" placeholder="Input 1" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input8" placeholder="Input 2" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input9" placeholder="Input 3" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input10" placeholder="Input 4" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input11" placeholder="Input 5" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    '<input id="input12" placeholder="Input 6" style="width:100%;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #4b5563;background:#111827;color:#fff;" />' +
    "</div>" +
    '<button id="runBtn" style="width:100%;padding:6px;border-radius:6px;border:none;background:#3b82f6;color:white;cursor:pointer;">' +
    "Run" +
    "</button>" +
    '<div id="statusMsg" style="margin-top:8px;min-height:16px;color:#ef4444;font-size:12px;"></div>';

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>("#closeBtn");
  const runBtn = overlay.querySelector<HTMLButtonElement>("#runBtn");
  const statusMsg = overlay.querySelector<HTMLDivElement>("#statusMsg");
  const tab1Btn = overlay.querySelector<HTMLButtonElement>("#tab1Btn");
  const tab2Btn = overlay.querySelector<HTMLButtonElement>("#tab2Btn");
  const tab1Fields = overlay.querySelector<HTMLDivElement>("#tab1Fields");
  const tab2Fields = overlay.querySelector<HTMLDivElement>("#tab2Fields");
  let activeTabIndex = 0;

  const setStatusMessage = (message: string) => {
    if (statusMsg) {
      statusMsg.textContent = message;
    }
  };

  const getSourceInputIds = (tabIndex: number) => {
    if (tabIndex === 1) {
      return tab2SourceInputIds;
    }

    return tab1SourceInputIds;
  };

  const setActiveTab = (tabIndex: number) => {
    activeTabIndex = tabIndex;

    if (tab1Fields) {
      tab1Fields.style.display = tabIndex === 0 ? "grid" : "none";
    }

    if (tab2Fields) {
      tab2Fields.style.display = tabIndex === 1 ? "grid" : "none";
    }

    if (tab1Btn) {
      tab1Btn.style.background = tabIndex === 0 ? "#3b82f6" : "#1f2937";
    }

    if (tab2Btn) {
      tab2Btn.style.background = tabIndex === 1 ? "#3b82f6" : "#1f2937";
    }
  };

  const normalizeMultilinePaste = (input: HTMLInputElement) => {
    input.addEventListener("paste", (event) => {
      const pastedText = event.clipboardData?.getData("text") ?? "";

      if (!/[\r\n]/.test(pastedText)) {
        return;
      }

      event.preventDefault();

      const mergedValue = pastedText
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .join(" ");

      input.value = mergedValue;
    });
  };

  [...tab1SourceInputIds, ...tab2SourceInputIds].forEach((sourceInputId) => {
    const input = overlay.querySelector<HTMLInputElement>(`#${sourceInputId}`);

    if (input) {
      normalizeMultilinePaste(input);
    }
  });

  if (tab1Btn) {
    tab1Btn.onclick = () => {
      setActiveTab(0);
    };
  }

  if (tab2Btn) {
    tab2Btn.onclick = () => {
      setActiveTab(1);
    };
  }

  setActiveTab(0);

  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.remove();
    };
  }

  if (runBtn) {
    runBtn.onclick = () => {
      setStatusMessage("");

      const sourceInputIds = getSourceInputIds(activeTabIndex);
      const sourceValues = sourceInputIds.map(
        (sourceInputId) =>
          overlay.querySelector<HTMLInputElement>(`#${sourceInputId}`)?.value ?? "",
      );
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
