"use strict";

window.ORCAIR_UI = (() => {
  function $(id) {
    return document.getElementById(id);
  }

  function getRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : null;
  }

  function setRadioValue(name, value) {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function numberOrNull(value) {
    if (value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatSignedNumber(value, unit = "") {
    const n = Number(value);
    if (!Number.isFinite(n)) return `0${unit}`;
    const sign = n > 0 ? "+" : "";
    return `${sign}${n}${unit}`;
  }

  function updateSliderLabels() {
    const linewidth = Number($("linewidth").value);
    const wnShift = Number($("wnShift").value);
    const normFactor = Number($("normFactor").value);
    const peakProminence = Number($("peakProminence").value);
    const peakDistance = Number($("peakDistance").value);

    $("linewidthValue").textContent = `${linewidth} cm⁻¹`;
    $("wnShiftValue").textContent = `${formatSignedNumber(wnShift, " cm⁻¹")}`;
    $("normFactorValue").textContent = `×${normFactor.toFixed(1)}`;
    $("peakProminenceValue").textContent = peakProminence.toFixed(3);
    $("peakDistanceValue").textContent = `${peakDistance} cm⁻¹`;
  }

  function readControls() {
    return {
      spectrumMode: getRadioValue("spectrumMode"),
      axisDirection: getRadioValue("axisDirection"),

      rangeMin: numberOrNull($("rangeMin").value),
      rangeMax: numberOrNull($("rangeMax").value),

      linewidth: Number($("linewidth").value),
      wnShift: Number($("wnShift").value),
      normFactor: Number($("normFactor").value),

      showPeaks: $("showPeaks").checked,
      showSticks: $("showSticks").checked,
      showGaussians: $("showGaussians").checked,
      showGrid: $("showGrid").checked,

      peakProminence: Number($("peakProminence").value),
      peakDistance: Number($("peakDistance").value),

      showExperimental: $("showExperimental").checked,
      normalizeExperimental: $("normalizeExperimental").checked
    };
  }

  function setControlsFromState(state) {
    if (!state) return;

    if (state.spectrumMode) {
      setRadioValue("spectrumMode", state.spectrumMode);
    }

    if (state.axisDirection) {
      setRadioValue("axisDirection", state.axisDirection);
    }

    if (state.rangeMin !== undefined && state.rangeMin !== null) {
      $("rangeMin").value = state.rangeMin;
    }

    if (state.rangeMax !== undefined && state.rangeMax !== null) {
      $("rangeMax").value = state.rangeMax;
    }

    if (state.linewidth !== undefined) $("linewidth").value = state.linewidth;
    if (state.wnShift !== undefined) $("wnShift").value = state.wnShift;
    if (state.normFactor !== undefined) $("normFactor").value = state.normFactor;

    if (state.peakProminence !== undefined) {
      $("peakProminence").value = state.peakProminence;
    }

    if (state.peakDistance !== undefined) {
      $("peakDistance").value = state.peakDistance;
    }

    if (state.showPeaks !== undefined) $("showPeaks").checked = state.showPeaks;
    if (state.showSticks !== undefined) $("showSticks").checked = state.showSticks;
    if (state.showGaussians !== undefined) $("showGaussians").checked = state.showGaussians;
    if (state.showGrid !== undefined) $("showGrid").checked = state.showGrid;
    if (state.showExperimental !== undefined) {
      $("showExperimental").checked = state.showExperimental;
    }
    if (state.normalizeExperimental !== undefined) {
      $("normalizeExperimental").checked = state.normalizeExperimental;
    }

    updateSliderLabels();
  }

  function bindControlEvents(callback) {
    const ids = [
      "modeAbs",
      "modeTrans",
      "axisHighLow",
      "axisLowHigh",

      "rangeMin",
      "rangeMax",

      "linewidth",
      "wnShift",
      "normFactor",

      "showPeaks",
      "showSticks",
      "showGaussians",
      "showGrid",

      "peakProminence",
      "peakDistance",

      "showExperimental",
      "normalizeExperimental"
    ];

    for (const id of ids) {
      const el = $(id);
      if (!el) continue;

      const eventName = el.type === "range" ? "input" : "change";

      el.addEventListener(eventName, () => {
        updateSliderLabels();
        callback(readControls());
      });
    }
  }

  function bindFileInput(id, callback) {
    const input = $(id);
    if (!input) return;

    input.addEventListener("change", () => {
      const file = input.files && input.files.length > 0 ? input.files[0] : null;
      callback(file);
    });
  }

  function bindButton(id, callback) {
    const button = $(id);
    if (!button) return;

    button.addEventListener("click", callback);
  }

  function setStatus(text) {
    $("statusText").textContent = text;
  }

  function showWarning(text) {
    const panel = $("warningPanel");
    const warningText = $("warningText");

    warningText.textContent = text;
    panel.classList.remove("hidden");
  }

  function hideWarning() {
    $("warningPanel").classList.add("hidden");
  }

  function setInfo(text) {
    $("infoBox").textContent = text;
  }

  function setPeaks(text) {
    $("peaksBox").textContent = text;
  }

  function showToast(message, duration = 2200) {
    const toast = $("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => {
      toast.classList.remove("show");
    }, duration);
  }

  async function copyText(text) {
    if (!text) return false;

    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let ok = false;

    try {
      ok = document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }

    return ok;
  }

  function getInfoText() {
    return $("infoBox").textContent;
  }

  function getPeaksText() {
    return $("peaksBox").textContent;
  }

  function clearPlotPlaceholder() {
    const plot = $("plot");
    if (!plot) return;

    const placeholders = plot.querySelectorAll(
      ".mock-axis, .mock-spectrum, .mock-sticks, .empty-message"
    );

    for (const el of placeholders) {
      el.remove();
    }
  }

  function resetRangeInputs() {
    $("rangeMin").value = "";
    $("rangeMax").value = "";
  }

  return {
    $,
    updateSliderLabels,
    readControls,
    setControlsFromState,
    bindControlEvents,
    bindFileInput,
    bindButton,
    setStatus,
    showWarning,
    hideWarning,
    setInfo,
    setPeaks,
    showToast,
    copyText,
    getInfoText,
    getPeaksText,
    clearPlotPlaceholder,
    resetRangeInputs
  };
})();
