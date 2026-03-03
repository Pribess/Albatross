(() => {
  const id = "__MY_MACRO_OVERLAY__";

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
    "</button>";

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector<HTMLButtonElement>("#closeBtn");
  const runBtn = overlay.querySelector<HTMLButtonElement>("#runBtn");

  if (closeBtn) {
    closeBtn.onclick = () => {
      overlay.remove();
    };
  }

  if (runBtn) {
    runBtn.onclick = () => {
      console.log("Macro running...");
      alert("Macro executed");
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
