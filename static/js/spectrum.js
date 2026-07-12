"use strict";

window.ORCAIR_SPECTRUM = (() => {
  function buildSpectrum(parsedOrca, uiState) {
    if (!parsedOrca) {
      throw new Error("No parsed ORCA data available.");
    }

    const frequencies = parsedOrca.frequencies;
    const intensities = parsedOrca.intensities;
    const modes = parsedOrca.modes;

    if (!Array.isArray(frequencies) || !Array.isArray(intensities)) {
      throw new Error("Invalid ORCA data: frequencies or intensities are missing.");
    }

    if (frequencies.length === 0 || intensities.length === 0) {
      throw new Error("No IR frequencies or intensities available.");
    }

    if (frequencies.length !== intensities.length) {
      throw new Error("Invalid ORCA data: frequency and intensity arrays differ in length.");
    }

    const config = window.ORCAIR_CONFIG;
    const linewidth = sanitizePositiveNumber(uiState.linewidth, config.DEFAULTS.linewidth);
    const shift = sanitizeNumber(uiState.wnShift, config.DEFAULTS.wnShift);
    const normFactor = sanitizePositiveNumber(uiState.normFactor, config.DEFAULTS.normFactor);

    const lineshape =
      uiState.lineshape === "lorentzian" ? "lorentzian" : config.DEFAULTS.lineshape ?? "gaussian";
    const peakFn = lineshape === "lorentzian" ? lorentzian : gaussian;

    const frequencyScaling = getFrequencyScaling(parsedOrca, uiState, config);
    const correctedFrequencies = frequencies.map((freq) => {
      return freq * frequencyScaling.effectiveFactor + shift;
    });

    const x = buildXRange(correctedFrequencies, config.SPECTRUM);
    const rawSumY = new Array(x.length).fill(0);

    const shouldStoreSingleGaussians = Boolean(
      uiState.showGaussians || uiState.showFilledGaussians
    );
    const rawGaussians = shouldStoreSingleGaussians ? [] : null;

    for (let i = 0; i < correctedFrequencies.length; i++) {
      const center = correctedFrequencies[i];
      const intensity = sanitizeNumber(intensities[i], 0);

      if (!Number.isFinite(center) || !Number.isFinite(intensity)) {
        continue;
      }

      const gaussianY = new Array(x.length);

      for (let j = 0; j < x.length; j++) {
        const y = peakFn(intensity, center, x[j], linewidth);
        gaussianY[j] = y;
        rawSumY[j] += y;
      }

      if (shouldStoreSingleGaussians) {
        rawGaussians.push({
          mode: Array.isArray(modes) ? modes[i] : i,
          center,
          rawIntensity: intensity,
          y: gaussianY
        });
      }
    }

    const rawMax = maxArray(rawSumY);
    const maxStickIntensity = maxArray(intensities);

    /*
      Physical-unit y-axis mode (eps + km/mol).
      kmMolY is simply the raw, unnormalized Gaussian sum built from the
      Int/T**2 values in km/mol - already computed above as rawSumY.
      epsilonY is derived from it via the area-normalized conversion
      factor (see constants.js EPSILON block). Both are independent of
      normFactor and available for every ORCA version, since they only
      require the km/mol intensities that are always parsed.
    */
    const epsilonConfig = config.EPSILON ?? {
      AREA_PER_KMMOL: 100,
      GAUSSIAN_SHAPE_PREFACTOR: Math.sqrt(Math.log(2) / Math.PI),
      LORENTZIAN_SHAPE_PREFACTOR: 1 / Math.PI
    };

    const shapePrefactor =
      lineshape === "lorentzian"
        ? epsilonConfig.LORENTZIAN_SHAPE_PREFACTOR
        : epsilonConfig.GAUSSIAN_SHAPE_PREFACTOR;

    const epsFactor =
      (epsilonConfig.AREA_PER_KMMOL * shapePrefactor) / linewidth;

    const kmMolY = rawSumY;
    const epsilonY = rawSumY.map((y) => y * epsFactor);
    const maxEpsilon = maxArray(epsilonY);

    /*
      Main normalization:
      The broadened sum spectrum is normalized to max = 1,
      then multiplied by normFactor.
    */
    const rawMaxSafe = rawMax > 0 ? rawMax : 1;

    const unitAbsorptionY = rawSumY.map((y) => y / rawMaxSafe);
    const absorptionY = unitAbsorptionY.map((y) => y * normFactor);

    /*
      Transmission style:
      This is not physical %T. It is an inverted normalized display.
      For normFactor = 1, the baseline is 1.
      For normFactor = 100, the baseline is 100.
    */
    const transmissionY = absorptionY.map((y) => normFactor - y);

    /*
      Important:
      Sticks must use the same normalization denominator as the broadened
      spectrum. Otherwise they are scaled independently and can appear too high.
    */
    const sticks = correctedFrequencies.map((wn, i) => ({
      mode: Array.isArray(modes) ? modes[i] : i,
      wn,
      rawIntensity: intensities[i],
      y: intensities[i] / rawMaxSafe * normFactor,

      /*
        Always available, independent of the selected y-axis mode:
        the raw km/mol value (identical to rawIntensity, kept as an
        explicit alias for clarity in export/peaks code) and the
        derived epsilon value at this stick's line center.
      */
      kmMol: intensities[i],
      epsilon: Number.isFinite(intensities[i]) ? intensities[i] * epsFactor : null
    }));

    /*
      Single Gaussians are normalized with the same denominator as the sum.
      Therefore their relative height is consistent with the plotted spectrum.
    */
    const gaussians = shouldStoreSingleGaussians
      ? rawGaussians.map((g) => ({
          mode: g.mode,
          center: g.center,
          rawIntensity: g.rawIntensity,

          /*
            Normalized Gaussian component for the normalized display mode.
            This keeps the previous behaviour unchanged.
          */
          y: g.y.map((value) => value / rawMaxSafe * normFactor),

          /*
            Physical Gaussian component.
            The basis remains the raw ORCA intensity in km/mol.
            epsilonY is only the linearly coupled representation used by
            the physical ε + km/mol plot.
          */
          kmMolY: g.y,
          epsilonY: g.y.map((value) => value * epsFactor)
        }))
      : [];

    return {
      x,

      unitAbsorptionY,
      absorptionY,
      transmissionY,

      currentY:
        uiState.spectrumMode === "transmission"
          ? transmissionY
          : absorptionY,

      sticks,
      gaussians,

      kmMolY,
      epsilonY,

      correctedFrequencies,
      shiftedFrequencies: correctedFrequencies,

      stats: {
        points: x.length,
        xMin: x.length > 0 ? x[0] : null,
        xMax: x.length > 0 ? x[x.length - 1] : null,
        rawMax,
        normalizedMax: normFactor,
        maxStickIntensity,
        epsFactor,
        maxEpsilon,
        frequencyScaleFactorApp: frequencyScaling.appFactor,
        frequencyScaleFactorOrca: frequencyScaling.orcaFactor,
        frequencyScaleFactorEffective: frequencyScaling.effectiveFactor,
        lineshape
      }
    };
  }

  function getFrequencyScaling(parsedOrca, uiState, config) {
    const defaultFactor = config.DEFAULTS.frequencyScaleFactor ?? 1.0;

    const appFactor = sanitizePositiveNumber(
      uiState?.frequencyScaleFactor,
      defaultFactor
    );

    const orcaFactor = sanitizePositiveNumber(
      parsedOrca?.frequencyScaling?.factor,
      defaultFactor
    );

    return {
      appFactor,
      orcaFactor,
      effectiveFactor: appFactor / orcaFactor
    };
  }

  function gaussian(amplitude, center, x, linewidth) {
    return amplitude * Math.exp(
      -(Math.log(2) * ((center - x) / linewidth) ** 2)
    );
  }

  /*
    Lorentzian peak, parameterized by HWHM (linewidth), matching the
    height/width convention of gaussian() above: both return `amplitude`
    exactly at x = center, and fall to amplitude/2 at |x - center| = linewidth.
  */
  function lorentzian(amplitude, center, x, linewidth) {
    return amplitude * (linewidth ** 2) / ((center - x) ** 2 + linewidth ** 2);
  }

  function buildXRange(correctedFrequencies, spectrumConfig) {
    const step = spectrumConfig.X_STEP;
    const padding = spectrumConfig.WN_PADDING;

    const finiteFrequencies = correctedFrequencies.filter(Number.isFinite);

    if (finiteFrequencies.length === 0) {
      return [];
    }

    const maxFreq = Math.max(...finiteFrequencies);

    /*
      Keep the lower bound at 0 cm⁻¹, matching the original Python script.
      The upper bound includes padding for Gaussian broadening.
    */
    const xMin = 0;
    const xMax = Math.ceil(Math.max(0, maxFreq + padding));

    return rangeInclusive(xMin, xMax, step);
  }

  function rangeInclusive(start, stop, step) {
    const values = [];

    if (!Number.isFinite(start) || !Number.isFinite(stop) || !Number.isFinite(step)) {
      return values;
    }

    if (step <= 0) {
      return values;
    }

    for (let value = start; value <= stop; value += step) {
      values.push(value);
    }

    return values;
  }

  function maxArray(values) {
    let max = -Infinity;

    for (const value of values) {
      if (Number.isFinite(value) && value > max) {
        max = value;
      }
    }

    return max === -Infinity ? 0 : max;
  }

  function sanitizeNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function sanitizePositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  return {
    buildSpectrum,
    gaussian,
    lorentzian
  };
})();