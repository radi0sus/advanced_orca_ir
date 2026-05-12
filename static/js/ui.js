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

  function getFrequencyScaleLimits() {
    const config = window.ORCAIR_CONFIG;

    return {
      min: config?.LIMITS?.frequencyScaleFactorMin ?? 0.9,
      max: config?.LIMITS?.frequencyScaleFactorMax ?? 1.1,
      fallback: config?.DEFAULTS?.frequencyScaleFactor ?? 1.0
    };
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseFlexibleNumber(value) {
    if (value === null || value === undefined) {
      return NaN;
    }

    const text = String(value)
      .trim()
      .replace(",", ".");

    if (text === "") {
      return NaN;
    }

    const number = Number(text);

    return Number.isFinite(number) ? number : NaN;
  }

  function sanitizeFrequencyScaleFactor(value) {
    const limits = getFrequencyScaleLimits();
    const number = parseFlexibleNumber(value);

    if (!Number.isFinite(number)) {
      return limits.fallback;
    }

    return clampNumber(number, limits.min, limits.max);
  }

  function readFrequencyScaleFactorFromControls() {
    const input = $("frequencyScaleFactorInput");
    const slider = $("frequencyScaleFactor");

    if (input) {
      const inputValue = parseFlexibleNumber(input.value);

      if (Number.isFinite(inputValue)) {
        return sanitizeFrequencyScaleFactor(inputValue);
      }
    }

    if (slider) {
      return sanitizeFrequencyScaleFactor(slider.value);
    }

    return getFrequencyScaleLimits().fallback;
  }

  function setFrequencyScaleFactorControl(value) {
    const factor = sanitizeFrequencyScaleFactor(value);
    const formatted = factor.toFixed(4);

    const slider = $("frequencyScaleFactor");
    const input = $("frequencyScaleFactorInput");
    const label = $("frequencyScaleFactorValue");

    if (slider) {
      slider.value = formatted;
    }

    if (input) {
      input.value = formatted;
    }

    if (label) {
      label.textContent = `×${formatted}`;
    }
  }

  function syncFrequencyScaleFactorControls(sourceId = null) {
    const slider = $("frequencyScaleFactor");
    const input = $("frequencyScaleFactorInput");

    if (!slider && !input) {
      return;
    }

    let value;

    if (sourceId === "frequencyScaleFactor" && slider) {
      value = slider.value;
    } else if (sourceId === "frequencyScaleFactorInput" && input) {
      value = input.value;
    } else {
      value = readFrequencyScaleFactorFromControls();
    }

    setFrequencyScaleFactorControl(value);
  }

  function updateSliderLabels() {
    const linewidth = Number($("linewidth").value);
    const wnShift = Number($("wnShift").value);
    const normFactor = Number($("normFactor").value);
    const peakProminence = Number($("peakProminence").value);
    const peakDistance = Number($("peakDistance").value);

    const frequencyScaleFactor = readFrequencyScaleFactorFromControls();

    $("linewidthValue").textContent = `${linewidth} cm⁻¹`;
    $("wnShiftValue").textContent = `${formatSignedNumber(wnShift, " cm⁻¹")}`;
    $("normFactorValue").textContent = `×${normFactor.toFixed(1)}`;
    $("frequencyScaleFactorValue").textContent = `×${frequencyScaleFactor.toFixed(4)}`;
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
      frequencyScaleFactor: readFrequencyScaleFactorFromControls(),

      showPeaks: $("showPeaks").checked,
      showSticks: $("showSticks").checked,
      showGaussians: $("showGaussians").checked,
      showFilledGaussians: $("showFilledGaussians").checked,
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

    if (state.frequencyScaleFactor !== undefined) {
      setFrequencyScaleFactorControl(state.frequencyScaleFactor);
    }

    if (state.peakProminence !== undefined) {
      $("peakProminence").value = state.peakProminence;
    }

    if (state.peakDistance !== undefined) {
      $("peakDistance").value = state.peakDistance;
    }

    if (state.showPeaks !== undefined) $("showPeaks").checked = state.showPeaks;
    if (state.showSticks !== undefined) $("showSticks").checked = state.showSticks;
    if (state.showGaussians !== undefined) $("showGaussians").checked = state.showGaussians;
    if (state.showFilledGaussians !== undefined) {
      $("showFilledGaussians").checked = state.showFilledGaussians;
    }
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
      "frequencyScaleFactor",
      "frequencyScaleFactorInput",

      "showPeaks",
      "showSticks",
      "showGaussians",
      "showFilledGaussians",
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
        if (
          id === "frequencyScaleFactor" ||
          id === "frequencyScaleFactorInput"
        ) {
          syncFrequencyScaleFactorControls(id);
        }

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