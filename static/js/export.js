"use strict";

window.ORCAIR_EXPORT = (() => {
  function exportSpectrumCsv(appState) {
    const spectrum = appState.spectrum;
    const parsed = appState.parsedOrca;
    const config = window.ORCAIR_CONFIG;

    if (!spectrum) {
      throw new Error("No spectrum available for CSV export.");
    }

    const delimiter = config.EXPORT_CSV_DELIMITER || ",";
    const transmittancePercent = buildTransmittancePercent(spectrum);

    const lines = [];

    lines.push([
      "wn_cm-1",
      "transmittance_percent",
      "abs_norm",
      "abs_scaled"
    ].join(delimiter));

    for (let i = 0; i < spectrum.x.length; i++) {
      const wn = spectrum.x[i];
      const percentT = transmittancePercent[i];
      const absNorm = spectrum.unitAbsorptionY[i];
      const absScaled = spectrum.absorptionY[i];

      lines.push([
        formatNumber(wn, 2),
        formatNumber(percentT, 6),
        formatNumber(absNorm, 8),
        formatNumber(absScaled, 8)
      ].join(delimiter));
    }

    const filename = `${buildBaseFilename(parsed, "orca-ir-spectrum")}-spectrum.csv`;
    const csvText = lines.join("\n");

    downloadTextFile(csvText, filename, "text/csv;charset=utf-8");
  }

  async function exportCurrentPlotPng(appState) {
    if (!window.Plotly) {
      throw new Error("Plotly is not loaded.");
    }

    const plotElement = document.getElementById("plot");

    if (!plotElement) {
      throw new Error("Plot element not found.");
    }

    const filename = `${buildBaseFilename(appState.parsedOrca, "orca-ir-spectrum")}-plot`;

    /*
      Plotly exports PNGs by pixel dimensions, not by real DPI metadata.

      2800 × 1800 px corresponds approximately to:
      9.33 × 6.00 inch at 300 dpi.

      This is suitable for high-resolution publication-style raster output.
    */
    await Plotly.downloadImage(plotElement, {
      format: "png",
      filename,
      width: 1400,
      height: 900,
      scale: 2
    });
  }

  function buildTransmittancePercent(spectrum) {
    const baseline = getTransmissionBaseline(spectrum);

    return spectrum.unitAbsorptionY.map((value) => {
      return unitAbsorptionToTransmittance(value, baseline);
    });
  }

  function getTransmissionBaseline(spectrum) {
    const y = spectrum.unitAbsorptionY;

    if (!Array.isArray(y) || y.length === 0) {
      return 0;
    }

    const first = Number.isFinite(y[0]) ? y[0] : 0;
    const last = Number.isFinite(y[y.length - 1]) ? y[y.length - 1] : 0;

    /*
      Same display baseline logic as in plot.js:
      edge tails are treated as baseline so the transmittance starts at 100 %.
    */
    return Math.max(first, last);
  }

  function unitAbsorptionToTransmittance(value, baseline) {
    const denominator = Math.max(1 - baseline, 1e-12);
    const corrected = (value - baseline) / denominator;
    const clipped = clamp(corrected, 0, 1);

    return 100 - clipped * 100;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function buildBaseFilename(parsed, fallback) {
    if (!parsed || !parsed.filename) {
      return fallback;
    }

    return parsed.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "_");
  }

  function formatNumber(value, decimals) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "";
    }

    return number.toFixed(decimals);
  }

  function downloadTextFile(text, filename, mimeType) {
    const blob = new Blob([text], {
      type: mimeType
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  return {
    exportSpectrumCsv,
    exportCurrentPlotPng
  };
})();
