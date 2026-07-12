"use strict";

window.ORCAIR_PEAKS = (() => {
  function detectPeaks(spectrum, uiState) {
    if (!spectrum || !Array.isArray(spectrum.x) || !Array.isArray(spectrum.unitAbsorptionY)) {
      return [];
    }

    const x = spectrum.x;
    const y = spectrum.unitAbsorptionY;

    if (x.length < 3 || y.length < 3 || x.length !== y.length) {
      return [];
    }

    const prominenceThreshold = sanitizePositiveNumber(uiState.peakProminence, 0.05);
    const minDistanceCm = sanitizePositiveNumber(uiState.peakDistance, 15);

    const spacing = estimateSpacing(x);
    const minDistancePoints = Math.max(1, Math.round(minDistanceCm / spacing));

    const candidates = findPeakCandidates(x, y, prominenceThreshold);
    const filtered = enforceMinimumDistance(candidates, minDistancePoints);

    const maxIntensity = maxArray(filtered.map((peak) => peak.intensity));
    const maxIntensitySafe = maxIntensity > 0 ? maxIntensity : 1;

    const kmMolY = Array.isArray(spectrum.kmMolY) ? spectrum.kmMolY : null;
    const epsilonY = Array.isArray(spectrum.epsilonY) ? spectrum.epsilonY : null;

    return filtered
      .map((peak) => {
        const relIntensity = peak.intensity / maxIntensitySafe;

        return {
          ...peak,
          relIntensity,
          strength: classifyStrength(relIntensity),
          kmMol: kmMolY ? kmMolY[peak.index] : null,
          epsilon: epsilonY ? epsilonY[peak.index] : null
        };
      })
      .sort((a, b) => b.wn - a.wn);
  }

  function findPeakCandidates(x, y, prominenceThreshold) {
    const candidates = [];

    for (let i = 1; i < y.length - 1; i++) {
      if (!(y[i] > y[i - 1] && y[i] >= y[i + 1])) {
        continue;
      }

      const leftMin = findLeftMinimum(y, i);
      const rightMin = findRightMinimum(y, i);

      const base = Math.max(leftMin, rightMin);
      const prominence = y[i] - base;

      if (prominence < prominenceThreshold) {
        continue;
      }

      candidates.push({
        index: i,
        wn: x[i],
        intensity: y[i],
        prominence
      });
    }

    return candidates;
  }

  function findLeftMinimum(y, peakIndex) {
    const peakValue = y[peakIndex];
    let minimum = peakValue;

    for (let i = peakIndex - 1; i >= 0; i--) {
      if (y[i] < minimum) {
        minimum = y[i];
      }

      if (y[i] > peakValue) {
        break;
      }
    }

    return minimum;
  }

  function findRightMinimum(y, peakIndex) {
    const peakValue = y[peakIndex];
    let minimum = peakValue;

    for (let i = peakIndex + 1; i < y.length; i++) {
      if (y[i] < minimum) {
        minimum = y[i];
      }

      if (y[i] > peakValue) {
        break;
      }
    }

    return minimum;
  }

  function enforceMinimumDistance(candidates, minDistancePoints) {
    const strongestFirst = [...candidates].sort((a, b) => b.intensity - a.intensity);
    const accepted = [];

    for (const candidate of strongestFirst) {
      const tooClose = accepted.some((peak) => {
        return Math.abs(candidate.index - peak.index) < minDistancePoints;
      });

      if (!tooClose) {
        accepted.push(candidate);
      }
    }

    return accepted.sort((a, b) => a.index - b.index);
  }

  function estimateSpacing(x) {
    if (x.length < 2) {
      return 1;
    }

    const first = x[0];
    const last = x[x.length - 1];
    const spacing = Math.abs(last - first) / (x.length - 1);

    return spacing > 0 ? spacing : 1;
  }

  function classifyStrength(relIntensity) {
    if (relIntensity >= 0.75) {
      return "vs";
    }

    if (relIntensity >= 0.50) {
      return "s";
    }

    if (relIntensity >= 0.25) {
      return "m";
    }

    if (relIntensity >= 0.10) {
      return "w";
    }

    return "vw";
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

  function sanitizePositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  return {
    detectPeaks,
    classifyStrength
  };
})();
