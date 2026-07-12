"use strict";

(() => {
  const CONFIG = window.ORCAIR_CONFIG;
  const UI = window.ORCAIR_UI;
  const ORCA_IMPORT = window.ORCAIR_ORCA_IMPORT;
  const SPECTRUM = window.ORCAIR_SPECTRUM;
  const PEAKS = window.ORCAIR_PEAKS;
  const PLOT = window.ORCAIR_PLOT;
  const EXPORT = window.ORCAIR_EXPORT;
  const EXPERIMENTAL_CSV = window.ORCAIR_EXPERIMENTAL_CSV;

  if (!CONFIG) {
    throw new Error("ORCAIR_CONFIG is not loaded. Check constants.js.");
  }

  if (!UI) {
    throw new Error("ORCAIR_UI is not loaded. Check ui.js.");
  }

  if (!ORCA_IMPORT) {
    throw new Error("ORCAIR_ORCA_IMPORT is not loaded. Check orca-import.js and script order.");
  }

  if (!SPECTRUM) {
    throw new Error("ORCAIR_SPECTRUM is not loaded. Check spectrum.js and script order.");
  }

  if (!PEAKS) {
    throw new Error("ORCAIR_PEAKS is not loaded. Check peak-detection.js and script order.");
  }

  if (!PLOT) {
    throw new Error("ORCAIR_PLOT is not loaded. Check plot.js and script order.");
  }

  if (!EXPORT) {
    throw new Error("ORCAIR_EXPORT is not loaded. Check export.js and script order.");
  }

  if (!EXPERIMENTAL_CSV) {
    throw new Error("ORCAIR_EXPERIMENTAL_CSV is not loaded. Check experimental-csv.js and script order.");
  }

  if (!window.Plotly) {
    throw new Error("Plotly is not loaded. Check static/vendor/plotly-2.35.2.min.js.");
  }

  const appState = {
    ui: { ...CONFIG.DEFAULTS },

    orcaFile: null,
    experimentalFile: null,

    parsedOrca: null,
    experimentalData: null,

    spectrum: null,
    peaks: []
  };

  function init() {
    UI.setControlsFromState(appState.ui);
    UI.updateSliderLabels();

    UI.setStatus(CONFIG.TEXT.noFileLoaded);
    UI.hideWarning();

    updateInfoBox();
    updatePeaksBox();

    bindEvents();
    bindThemeChangeEvent();

    console.log("ORCA IR Viewer initialized.");
  }

  function bindEvents() {
    UI.bindControlEvents((uiState) => {
      appState.ui = normalizeYAxisModeState(uiState);
      updateFromCurrentState();
    });

    UI.bindFileInput("orcaFile", handleOrcaFileSelected);
    UI.bindFileInput("expFile", handleExperimentalFileSelected);

    UI.bindButton("resetViewBtn", handleResetView);

    UI.bindButton("exportPngBtn", handleExportPng);
    UI.bindButton("exportCsvBtn", handleExportCsv);

    UI.bindButton("copyInfoBtn", handleCopyInfo);
    UI.bindButton("copyPeaksBtn", handleCopyPeaks);
  }

  function bindThemeChangeEvent() {
    if (!window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleThemeChange = () => {
      if (appState.spectrum) {
        PLOT.renderPlot(appState);
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleThemeChange);
    } else if (typeof mediaQuery.addListener === "function") {
      /*
        Fallback for older Safari versions.
      */
      mediaQuery.addListener(handleThemeChange);
    }
  }

  async function handleOrcaFileSelected(file) {
    appState.orcaFile = file;
    appState.parsedOrca = null;
    appState.spectrum = null;
    appState.peaks = [];

    UI.hideWarning();

    if (!file) {
      UI.setStatus(CONFIG.TEXT.noFileLoaded);
      updateInfoBox();
      updatePeaksBox();
      return;
    }

    try {
      UI.setStatus(`Reading file: ${file.name}`);

      const text = await file.text();
      const parsed = ORCA_IMPORT.parseOrcaOutput(text, file.name);

      appState.parsedOrca = parsed;
      appState.ui.frequencyScaleFactor = getInitialFrequencyScaleFactor(parsed);

      UI.setControlsFromState(appState.ui);
      UI.setStatus(`Loaded: ${file.name} (${parsed.stats.modesParsed} IR modes)`);

      if (parsed.warnings.length > 0) {
        UI.showWarning(parsed.warnings.join(" "));
      } else {
        UI.hideWarning();
      }

      updateFromCurrentState();

      UI.showToast(`Loaded ORCA file: ${file.name}`);
    } catch (error) {
      console.error(error);

      appState.parsedOrca = null;
      appState.spectrum = null;
      appState.peaks = [];

      UI.setStatus("Could not parse ORCA file.");
      UI.showWarning(error.message || "Could not parse ORCA file.");
      UI.showToast("Could not parse ORCA file.");

      updateInfoBox();
      updatePeaksBox();
    }
  }

  async function handleExperimentalFileSelected(file) {
    appState.experimentalFile = file;
    appState.experimentalData = null;

    if (!file) {
      UI.$("showExperimental").checked = false;
      appState.ui = UI.readControls();

      UI.showToast("No experimental file selected.");
      updateInfoBox();
      updateFromCurrentState();
      return;
    }

    try {
      UI.showToast(`Reading experimental CSV: ${file.name}`);

      const text = await file.text();
      const parsedExperimental = EXPERIMENTAL_CSV.parseExperimentalCsv(
        text,
        file.name
      );

      appState.experimentalData = parsedExperimental;

      /*
        User expectation:
        As soon as an experimental CSV is loaded successfully,
        enable the overlay automatically.
      */
      UI.$("showExperimental").checked = true;
      appState.ui = UI.readControls();

      if (parsedExperimental.warnings.length > 0) {
        UI.showToast(parsedExperimental.warnings.join(" "));
      } else {
        UI.showToast(`Loaded experimental CSV: ${file.name}`);
      }

      updateInfoBox();
      updateFromCurrentState();
    } catch (error) {
      console.error(error);

      appState.experimentalData = null;

      UI.$("showExperimental").checked = false;
      appState.ui = UI.readControls();

      UI.showToast("Could not parse experimental CSV.");
      updateInfoBox();
      updateFromCurrentState();
    }
  }

  function handleResetView() {
    UI.resetRangeInputs();
    appState.ui = UI.readControls();

    updateFromCurrentState();
    UI.showToast("View range reset.");
  }

  async function handleExportPng() {
    if (!appState.spectrum) {
      UI.showToast("No spectrum available for PNG export.");
      return;
    }

    try {
      await EXPORT.exportCurrentPlotPng(appState);
      UI.showToast("PNG exported.");
    } catch (error) {
      console.error(error);
      UI.showToast("Could not export PNG.");
    }
  }

  function handleExportCsv() {
    if (!appState.spectrum) {
      UI.showToast("No spectrum available for CSV export.");
      return;
    }

    try {
      EXPORT.exportSpectrumCsv(appState);
      UI.showToast("CSV exported.");
    } catch (error) {
      console.error(error);
      UI.showToast("Could not export CSV.");
    }
  }

  async function handleCopyInfo() {
    const ok = await UI.copyText(UI.getInfoText());
    UI.showToast(ok ? "Info copied." : "Could not copy info.");
  }

  async function handleCopyPeaks() {
    const ok = await UI.copyText(UI.getPeaksText());
    UI.showToast(ok ? "Peaks copied." : "Could not copy peaks.");
  }

  function normalizeYAxisModeState(uiState) {
    if (uiState.yAxisMode === "physical" && uiState.spectrumMode === "transmission") {
      const el = UI.$("modeAbs");
      if (el) el.checked = true;

      return { ...uiState, spectrumMode: "absorption" };
    }

    return uiState;
  }

  function updateFromCurrentState() {
    if (!appState.parsedOrca) {
      updateInfoBox();
      updatePeaksBox();
      return;
    }

    try {
      appState.spectrum = SPECTRUM.buildSpectrum(
        appState.parsedOrca,
        appState.ui
      );

      appState.peaks = PEAKS.detectPeaks(
        appState.spectrum,
        appState.ui
      );

      PLOT.renderPlot(appState);

      updateInfoBox();
      updatePeaksBox();
    } catch (error) {
      console.error(error);

      appState.spectrum = null;
      appState.peaks = [];

      UI.showWarning(error.message || "Could not build spectrum.");
      UI.showToast("Could not build spectrum.");

      updateInfoBox();
      updatePeaksBox();
    }
  }

  function updateInfoBox() {
    const ui = appState.ui;
    const file = appState.orcaFile;
    const parsed = appState.parsedOrca;
    const spectrum = appState.spectrum;
    const experimental = appState.experimentalData;

    const frequencyScaling = getFrequencyScalingInfo(parsed, ui);

    const effectiveRangeMin = ui.rangeMin ?? spectrum?.stats?.xMin ?? null;
    const effectiveRangeMax = ui.rangeMax ?? spectrum?.stats?.xMax ?? null;

    const rangeMin = formatCmValue(effectiveRangeMin, 0);
    const rangeMax = formatCmValue(effectiveRangeMax, 0);

    const filename = file ? file.name : "–";

    const orcaVersion = parsed?.orcaVersion ?? "–";
    const irSection = parsed?.irSectionFound ? "found" : "–";
    const modesParsed = parsed?.stats?.modesParsed ?? "–";
    const imaginaryModes = parsed?.imaginaryModes?.length ?? "–";

    const frequencyRange = parsed
      ? `${parsed.stats.minFrequency.toFixed(2)} – ${parsed.stats.maxFrequency.toFixed(2)} cm⁻¹`
      : "–";

    const maxIntensity = parsed
      ? parsed.stats.maxIntensity.toFixed(4)
      : "–";

    const intensityColumn = parsed
      ? `${parsed.intensityColumnName} / index ${parsed.intensityColumnIndex}`
      : "–";

    const calculatedPoints = spectrum
      ? spectrum.stats.points
      : "–";

    const calculatedRange = spectrum
      ? `${formatCmValue(spectrum.stats.xMin, 0)} – ${formatCmValue(spectrum.stats.xMax, 0)}`
      : "–";

    const experimentalFilename = experimental?.filename ?? "–";

    const experimentalRange = experimental
      ? `${experimental.stats.xMin.toFixed(2)} – ${experimental.stats.xMax.toFixed(2)} cm⁻¹`
      : "–";

    const experimentalPoints = experimental
      ? experimental.stats.points
      : "–";

    const experimentalDelimiter = experimental
      ? experimental.delimiterLabel
      : "–";

    const experimentalHeader = experimental
      ? yesNo(experimental.hasHeader)
      : "–";

    const text = [
      `Filename: ${filename}`,
      `ORCA version: ${orcaVersion}`,
      `IR section: ${irSection}`,
      `Modes parsed: ${modesParsed}`,
      `Imaginary modes: ${imaginaryModes}`,
      `Frequency range: ${frequencyRange}`,
      `Max intensity: ${maxIntensity}`,
      `Intensity column: ${intensityColumn}`,
      ``,
      `Calculated points: ${calculatedPoints}`,
      `Calculated range: ${calculatedRange}`,
      ``,
      `Y-axis mode: ${ui.yAxisMode}`,
      `Spectrum mode: ${ui.spectrumMode}`,
      `Axis direction: ${ui.axisDirection}`,
      `Displayed range min: ${rangeMin}`,
      `Displayed range max: ${rangeMax}`,
      `HWHM: ${ui.linewidth} cm⁻¹`,
      `FWHM: ${ui.linewidth * 2} cm⁻¹`,
      `Shift: ${formatSigned(ui.wnShift)} cm⁻¹`,
      `Frequency scaling ORCA factor found: ${frequencyScaling.foundLabel}`,
      `Frequency scaling ORCA factor: ${frequencyScaling.orcaFactorLabel}`,
      `Frequency scaling already applied by ORCA: ${frequencyScaling.alreadyAppliedLabel}`,
      `Frequency scaling app factor: ${frequencyScaling.appFactorLabel}`,
      `Frequency scaling effective factor: ${frequencyScaling.effectiveFactorLabel}`,
      `Normalization: max = 1, factor = ${Number(ui.normFactor).toFixed(1)}`,
      `Epsilon factor (100·sqrt(ln2/pi)/HWHM): ${spectrum ? spectrum.stats.epsFactor.toFixed(6) : "–"}`,
      ``,
      `Show peaks: ${yesNo(ui.showPeaks)}`,
      `Show sticks: ${yesNo(ui.showSticks)}`,
      `Show single Gaussians: ${yesNo(ui.showGaussians)}`,
      `Show filled Gaussians: ${yesNo(ui.showFilledGaussians)}`,
      `Show grid: ${yesNo(ui.showGrid)}`,
      ``,
      `Experimental file: ${experimentalFilename}`,
      `Experimental overlay: ${yesNo(ui.showExperimental)}`,
      `Normalize experimental: ${yesNo(ui.normalizeExperimental)}`,
      `Experimental points: ${experimentalPoints}`,
      `Experimental range: ${experimentalRange}`,
      `Experimental delimiter: ${experimentalDelimiter}`,
      `Experimental header: ${experimentalHeader}`
    ].join("\n");

    UI.setInfo(text);
  }

  function updatePeaksBox() {
    if (!appState.peaks || appState.peaks.length === 0) {
      UI.setPeaks(CONFIG.TEXT.noPeaksDetected);
      return;
    }

    const header = [
      padLeft("wn / cm⁻¹", 10),
      padLeft("rel. int. / %", 13),
      padLeft("strength", 8),
      padLeft("int. / km·mol⁻¹", 15),
      padLeft("ε / M⁻¹·cm⁻¹", 12)
    ].join("  ");

    const separator = [
      "-".repeat(10),
      "-".repeat(13),
      "-".repeat(8),
      "-".repeat(15),
      "-".repeat(12)
    ].join("  ");

    const rows = appState.peaks.map((peak) => {
      const wn = Number(peak.wn).toFixed(0);
      const rel = Number(peak.relIntensity * 100).toFixed(1);
      const strength = peak.strength || "";
      const kmMol = Number.isFinite(peak.kmMol) ? peak.kmMol.toFixed(2) : "–";
      const epsilon = Number.isFinite(peak.epsilon) ? peak.epsilon.toFixed(2) : "–";

      return [
        padLeft(wn, 10),
        padLeft(rel, 13),
        padLeft(strength, 8),
        padLeft(kmMol, 15),
        padLeft(epsilon, 12)
      ].join("  ");
    });

    UI.setPeaks([header, separator, ...rows].join("\n"));
  }

  function getInitialFrequencyScaleFactor(parsed) {
    const factor = parsed?.frequencyScaling?.factor;
    const fallback = CONFIG.DEFAULTS.frequencyScaleFactor;

    if (!Number.isFinite(Number(factor)) || Number(factor) <= 0) {
      return fallback;
    }

    return Number(factor);
  }

  function getFrequencyScalingInfo(parsed, ui) {
    const scaling = parsed?.frequencyScaling ?? null;

    const found = Boolean(scaling?.found);
    const alreadyApplied = Boolean(scaling?.alreadyApplied);

    const orcaFactor = sanitizePositiveNumber(
      scaling?.factor,
      CONFIG.DEFAULTS.frequencyScaleFactor
    );

    const appFactor = sanitizePositiveNumber(
      ui?.frequencyScaleFactor,
      CONFIG.DEFAULTS.frequencyScaleFactor
    );

    const effectiveFactor = appFactor / orcaFactor;

    return {
      foundLabel: parsed ? yesNo(found) : "–",
      orcaFactorLabel: parsed ? formatFactor(orcaFactor) : "–",
      alreadyAppliedLabel: parsed ? yesNo(alreadyApplied) : "–",
      appFactorLabel: formatFactor(appFactor),
      effectiveFactorLabel: parsed ? formatFactor(effectiveFactor) : formatFactor(1.0)
    };
  }

  function sanitizePositiveNumber(value, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return fallback;
    }

    return number;
  }

  function formatFactor(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "–";
    }

    return number.toFixed(6);
  }

  function yesNo(value) {
    return value ? "yes" : "no";
  }

  function formatSigned(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number > 0 ? `+${number}` : `${number}`;
  }

  function formatCmValue(value, decimals = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "–";
    }

    return `${number.toFixed(decimals)} cm⁻¹`;
  }

  function padLeft(value, width) {
    return String(value).padStart(width, " ");
  }

  document.addEventListener("DOMContentLoaded", init);
})();