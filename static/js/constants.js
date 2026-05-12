"use strict";

window.ORCAIR_CONFIG = Object.freeze({
  EXPORT_CSV_DELIMITER: ",",

  SPECTRUM: Object.freeze({
    X_STEP: 1,
    WN_PADDING: 150,
    FORCE_X_MIN_ZERO: true
  }),

  DEFAULTS: Object.freeze({
    spectrumMode: "transmission",
    axisDirection: "highToLow",

    linewidth: 15,
    wnShift: 0,
    frequencyScaleFactor: 1.0,
    normFactor: 1.0,

    peakProminence: 0.05,
    peakDistance: 15,

    showPeaks: true,
    showSticks: true,
    showGaussians: false,
    showFilledGaussians: false,
    showGrid: true,
    showExperimental: false,
    normalizeExperimental: true,

    rangeMin: null,
    rangeMax: null
  }),

  LIMITS: Object.freeze({
    linewidthMin: 1,
    linewidthMax: 100,

    wnShiftMin: -300,
    wnShiftMax: 300,

    frequencyScaleFactorMin: 0.9,
    frequencyScaleFactorMax: 1.1,
    frequencyScaleFactorStep: 0.0001,

    normFactorMin: 0.1,
    normFactorMax: 200,

    peakProminenceMin: 0.001,
    peakProminenceMax: 1,

    peakDistanceMin: 1,
    peakDistanceMax: 100
  }),

  TEXT: Object.freeze({
    noFileLoaded: "No ORCA file loaded.",
    noSpectrumLoaded: "No spectrum loaded.",
    noPeaksDetected: "No peaks detected.",
    defaultWarning:
      "Negative frequencies / imaginary modes detected."
  })
});
