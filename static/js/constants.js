"use strict";

window.ORCAIR_CONFIG = Object.freeze({
  EXPORT_CSV_DELIMITER: ",",

  SPECTRUM: Object.freeze({
    X_STEP: 1,
    WN_PADDING: 150,
    FORCE_X_MIN_ZERO: true,

    /*
      Upper x-axis padding must grow with the HWHM (linewidth), or broad
      peaks near the edge of the frequency range get visibly clipped.
      Lorentzian tails decay much slower than Gaussian tails (~1/w^2 vs.
      exponential), so they need a larger multiple of the HWHM to look
      un-clipped. WN_PADDING above is used as an absolute floor.
      WN_MAX is a hard ceiling so the axis never grows without bound.
    */
    PADDING_HWHM_MULTIPLIER_GAUSSIAN: 6,
    PADDING_HWHM_MULTIPLIER_LORENTZIAN: 20,
    WN_MAX: 4000
  }),

  /*
    Area-normalized eps (molar absorption coefficient) conversion.

    Derivation (matches Multiwfn's convention for IR/Raman/VCD/ROA spectra):
    If a mode's integrated intensity is p km/mol, the area under its
    epsilon(nu) curve (in L mol^-1 cm^-1, plotted against cm^-1) equals
    100 * p. For a Gaussian normalized to unit area with HWHM = w:
      g(x) = sqrt(ln2/pi) / w * exp(-ln2 * (x/w)^2)
    so the peak height factor is:
      epsFactor(w) = 100 * sqrt(ln2/pi) / w
    epsilon(x) = kmMolCurve(x) * epsFactor(w)

    Validated numerically against Multiwfn reference exports
    (Gaussian, HWHM = 4 cm-1): predicted/measured ratio agreed to 6
    significant figures.

    Lorentzian variant:
    For a Lorentzian normalized to unit area with HWHM = w:
      l(x) = 1/pi * w / (x^2 + w^2)
    so the peak height factor is:
      epsFactor(w) = 100 / (pi * w)
    Validated the same way (Lorentzian, HWHM = 4 cm-1): predicted/measured
    ratio agreed to 6 significant figures.
  */
  EPSILON: Object.freeze({
    AREA_PER_KMMOL: 100,
    GAUSSIAN_SHAPE_PREFACTOR: Math.sqrt(Math.log(2) / Math.PI),
    LORENTZIAN_SHAPE_PREFACTOR: 1 / Math.PI
  }),

  DEFAULTS: Object.freeze({
    spectrumMode: "transmission",
    yAxisMode: "normalized",
    axisDirection: "highToLow",
    lineshape: "gaussian",

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
    noFileLoaded: "No file loaded.",
    noSpectrumLoaded: "No spectrum loaded.",
    noPeaksDetected: "No peaks detected.",
    defaultWarning:
      "Negative frequencies / imaginary modes detected."
  })
});