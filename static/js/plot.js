"use strict";

window.ORCAIR_PLOT = (() => {
  function renderPlot(appState) {
    if (!window.Plotly) {
      console.error("Plotly is not loaded.");
      return;
    }

    const UI = window.ORCAIR_UI;

    const spectrum = appState.spectrum;
    const peaks = appState.peaks || [];
    const ui = appState.ui;
    const parsed = appState.parsedOrca;
    const experimental = appState.experimentalData;

    if (!spectrum) {
      return;
    }

    UI.clearPlotPlaceholder();

    const plotElement = UI.$("plot");
    const dark = isDarkMode();
    const colors = getThemeColors(dark);
    const isPhysical = ui.yAxisMode === "physical";

    const traces = isPhysical
      ? buildPhysicalTraces(spectrum, colors)
      : buildTraces(spectrum, experimental, ui, colors);

    const annotations = ui.showPeaks
      ? buildPeakAnnotations(spectrum, peaks, ui, colors.peak, isPhysical)
      : [];

    const layout = isPhysical
      ? buildPhysicalLayout({
          title: buildPlotTitle(parsed),
          spectrum,
          ui,
          annotations,
          colors
        })
      : buildLayout({
          title: buildPlotTitle(parsed),
          spectrum,
          experimental,
          ui,
          annotations,
          colors
        });

    const config = {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: [
        "select2d",
        "lasso2d",
        "autoScale2d"
      ],
      toImageButtonOptions: {
        format: "png",
        filename: buildExportFilename(parsed, "orca-ir-spectrum"),
        width: 1400,
        height: 900,
        scale: 2
      }
    };

    Plotly.react(plotElement, traces, layout, config);
  }

  function buildTraces(spectrum, experimental, ui, colors) {
    const traces = [];

    /*
      Draw order:
      1. filled Gaussian areas in the background
      2. individual Gaussian lines
      3. sticks
      4. calculated summed spectrum
      5. experimental overlay
    */
    if (ui.showFilledGaussians && spectrum.gaussians.length > 0) {
      traces.push(...buildFilledGaussianTraces(spectrum, ui));
    }

    if (ui.showGaussians && spectrum.gaussians.length > 0) {
      traces.push(...buildGaussianTraces(spectrum, ui, colors));
    }

    if (ui.showSticks && spectrum.sticks.length > 0) {
      traces.push(buildStickTrace(spectrum, ui, colors));
    }

    traces.push(buildSpectrumTrace(spectrum, ui, colors));

    if (shouldShowExperimental(experimental, ui)) {
      traces.push(buildExperimentalTrace(experimental, ui, colors));
    }

    return traces;
  }

  function buildPhysicalTraces(spectrum, colors) {
    const traces = [];

    /*
      Draw order (matches the Multiwfn reference layout):
      1. km/mol sticks on the secondary axis (thin, unbroadened lines)
      2. epsilon curve on the primary axis (broadened Gaussian sum)

      The curve's hovertemplate carries the km/mol curve value as
      customdata, so hovering anywhere on the plot shows both physical
      quantities at once, as requested.
    */
    traces.push(buildPhysicalStickTrace(spectrum, colors));
    traces.push(buildPhysicalCurveTrace(spectrum, colors));

    return traces;
  }

  function buildPhysicalCurveTrace(spectrum, colors) {
    const customdata = spectrum.kmMolY;

    return {
      x: spectrum.x,
      y: spectrum.epsilonY,
      customdata,
      type: "scatter",
      mode: "lines",
      name: "ε (calculated)",
      yaxis: "y",
      line: {
        color: colors.spectrum,
        width: 1.8
      },
      hovertemplate:
        "Wavenumber: %{x:.1f} cm⁻¹<br>" +
        "ε: %{y:.2f} L·mol⁻¹·cm⁻¹<br>" +
        "km/mol: %{customdata:.2f}<extra></extra>"
    };
  }

  function buildPhysicalStickTrace(spectrum, colors) {
    const x = [];
    const y = [];

    for (const stick of spectrum.sticks) {
      x.push(stick.wn, stick.wn, null);
      y.push(0, stick.kmMol, null);
    }

    return {
      x,
      y,
      type: "scatter",
      mode: "lines",
      name: "IR intensity (km/mol)",
      yaxis: "y2",
      line: {
        color: colors.sticks,
        width: 1.1
      },
      opacity: 0.85,
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function buildSpectrumTrace(spectrum, ui, colors) {
    const y = getDisplayedSpectrumY(spectrum, ui);

    return {
      x: spectrum.x,
      y,
      type: "scatter",
      mode: "lines",
      name: "Calculated",
      line: {
        color: colors.spectrum,
        width: 1.8
      },
      hovertemplate:
        "Calculated<br>" +
        "Wavenumber: %{x:.1f} cm⁻¹<br>" +
        "Y: %{y:.4f}<extra></extra>"
    };
  }

  function buildExperimentalTrace(experimental, ui, colors) {
    const y = getDisplayedExperimentalY(experimental, ui);

    if (ui.spectrumMode === "transmission") {
      return buildExperimentalFilledTrace({
        x: experimental.x,
        y,
        baselineY: 100,
        colors,
        name: "Experimental"
      });
    }

    return {
      x: experimental.x,
      y,
      type: "scatter",
      mode: "lines",
      fill: "tozeroy",
      fillcolor: colors.experimentalFill,
      name: "Experimental",
      line: {
        color: colors.experimental,
        width: 1.2,
        dash: "solid"
      },
      opacity: 1,
      hovertemplate:
        "Experimental<br>" +
        "Wavenumber: %{x:.1f} cm⁻¹<br>" +
        "Y: %{y:.4f}<extra></extra>"
    };
  }

  function buildExperimentalFilledTrace({ x, y, baselineY, colors, name }) {
    const polygonX = [];
    const polygonY = [];

    for (let i = 0; i < x.length; i++) {
      polygonX.push(x[i]);
      polygonY.push(y[i]);
    }

    for (let i = x.length - 1; i >= 0; i--) {
      polygonX.push(x[i]);
      polygonY.push(baselineY);
    }

    return {
      x: polygonX,
      y: polygonY,
      type: "scatter",
      mode: "lines",
      fill: "toself",
      fillcolor: colors.experimentalFill,
      name,
      line: {
        color: colors.experimental,
        width: 1.2,
        dash: "solid"
      },
      opacity: 1,
      hoverinfo: "skip"
    };
  }

  function buildGaussianTraces(spectrum, ui, colors) {
    const x = [];
    const y = [];

    for (const gaussian of spectrum.gaussians) {
      const gaussianY = getDisplayedGaussianY(gaussian, spectrum, ui);

      for (let i = 0; i < spectrum.x.length; i++) {
        x.push(spectrum.x[i]);
        y.push(gaussianY[i]);
      }

      x.push(null);
      y.push(null);
    }

    return [
      {
        x,
        y,
        type: "scatter",
        mode: "lines",
        name: "Single Gaussians",
        line: {
          color: colors.gaussian,
          width: 0.8,
          dash: "solid"
        },
        opacity: 1,
        hoverinfo: "skip",
        showlegend: false
      }
    ];
  }

  function buildFilledGaussianTraces(spectrum, ui) {
    const traces = [];

    if (!Array.isArray(spectrum.gaussians) || spectrum.gaussians.length === 0) {
      return traces;
    }

    const centers = spectrum.gaussians
      .map((gaussian) => gaussian.center)
      .filter(Number.isFinite);

    const minCenter = centers.length > 0 ? Math.min(...centers) : 0;
    const maxCenter = centers.length > 0 ? Math.max(...centers) : 1;

    for (const gaussian of spectrum.gaussians) {
      if (!Number.isFinite(gaussian.rawIntensity) || gaussian.rawIntensity <= 0) {
        continue;
      }

      const gaussianY = getDisplayedGaussianY(gaussian, spectrum, ui);
      const baselineY = ui.spectrumMode === "transmission" ? 100 : 0;

      const x = [];
      const y = [];

      for (let i = 0; i < spectrum.x.length; i++) {
        x.push(spectrum.x[i]);
        y.push(gaussianY[i]);
      }

      for (let i = spectrum.x.length - 1; i >= 0; i--) {
        x.push(spectrum.x[i]);
        y.push(baselineY);
      }

      const fillColor = gaussianRainbowColor(
        gaussian.center,
        minCenter,
        maxCenter,
        0.16
      );

      const lineColor = gaussianRainbowColor(
        gaussian.center,
        minCenter,
        maxCenter,
        0.35
      );

      traces.push({
        x,
        y,
        type: "scatter",
        mode: "lines",
        fill: "toself",
        fillcolor: fillColor,
        name: `Filled Gaussian ${gaussian.mode}`,
        line: {
          color: lineColor,
          width: 0.45
        },
        hoverinfo: "skip",
        showlegend: false
      });
    }

    return traces;
  }

  function gaussianRainbowColor(center, minCenter, maxCenter, alpha) {
    const denominator = Math.max(maxCenter - minCenter, 1e-12);
    const relative = clamp((center - minCenter) / denominator, 0, 1);

    /*
      Low wavenumbers: violet/blue
      High wavenumbers: red/orange
    */
    const hue = 260 - relative * 260;

    return `hsla(${hue.toFixed(1)}, 85%, 55%, ${alpha})`;
  }

  function buildStickTrace(spectrum, ui, colors) {
    const x = [];
    const y = [];

    for (const stick of spectrum.sticks) {
      if (ui.spectrumMode === "transmission") {
        const baseline = 100;
        const depth = getDisplayedStickDepth(stick, spectrum, ui);
        const dip = baseline - depth;

        x.push(stick.wn, stick.wn, null);
        y.push(baseline, dip, null);
      } else {
        const height = getDisplayedStickDepth(stick, spectrum, ui);

        x.push(stick.wn, stick.wn, null);
        y.push(0, height, null);
      }
    }

    return {
      x,
      y,
      type: "scatter",
      mode: "lines",
      name: "Sticks",
      line: {
        color: colors.sticks,
        width: 1.1
      },
      opacity: 0.75,
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function buildPeakAnnotations(spectrum, peaks, ui, peakColor, isPhysical = false) {
    const annotations = [];
    const filteredPeaks = thinPeakLabels(peaks, 15);

    for (const peak of filteredPeaks) {
      const y = isPhysical
        ? spectrum.epsilonY[peak.index]
        : getDisplayedPeakY(spectrum, peak, ui);

      if (!Number.isFinite(y)) {
        continue;
      }

      annotations.push({
        x: peak.wn,
        y,
        text: peak.wn.toFixed(0),
        showarrow: true,
        arrowhead: 0,
        arrowsize: 1,
        arrowwidth: 1,
        arrowcolor: peakColor,
        ax: 0,
        ay: ui.spectrumMode === "transmission" ? 56 : -34,
        textangle: -90,
        font: {
          size: 10,
          color: peakColor
        },
        xanchor: "center",
        align: "center"
      });
    }

    return annotations;
  }

  function thinPeakLabels(peaks, minDistanceCm) {
    const sorted = [...peaks].sort((a, b) => b.wn - a.wn);
    const labeled = [];
    let previousWn = Infinity;

    for (const peak of sorted) {
      if (Math.abs(previousWn - peak.wn) >= minDistanceCm) {
        labeled.push(peak);
        previousWn = peak.wn;
      }
    }

    return labeled;
  }

  function buildPhysicalLayout({ title, spectrum, ui, annotations, colors }) {
    const xRange = buildXRange(spectrum, ui);

    const epsUpper = spectrum.stats.maxEpsilon > 0
      ? spectrum.stats.maxEpsilon * 1.12
      : 1;

    const kmMolUpper = spectrum.stats.maxStickIntensity > 0
      ? spectrum.stats.maxStickIntensity * 1.12
      : 1;

    return {
      title: {
        text: title,
        x: 0.5,
        xanchor: "center",
        font: {
          size: 20,
          color: colors.text
        }
      },
      paper_bgcolor: colors.paperBg,
      plot_bgcolor: colors.plotBg,
      margin: {
        t: 72,
        r: 82,
        b: 96,
        l: 92
      },
      xaxis: {
        title: {
          text: "Wavenumber / cm⁻¹",
          font: {
            size: 15,
            color: colors.text
          }
        },
        range: xRange,
        showline: true,
        linecolor: colors.axis,
        linewidth: 1.4,
        mirror: true,
        ticks: "inside",
        ticklen: 6,
        tickwidth: 1.1,
        tickcolor: colors.axis,
        tickfont: {
          color: colors.text
        },
        showgrid: Boolean(ui.showGrid),
        gridcolor: colors.grid,
        zeroline: false,
        dtick: 500
      },
      yaxis: {
        title: {
          text: "Molar absorption coefficient ε / M⁻¹·cm⁻¹",
          font: {
            size: 14,
            color: colors.text
          }
        },
        range: [0, epsUpper],
        showline: true,
        linecolor: colors.axis,
        linewidth: 1.4,
        ticks: "inside",
        ticklen: 6,
        tickwidth: 1.1,
        tickcolor: colors.axis,
        tickfont: {
          color: colors.text
        },
        showgrid: false,
        zeroline: false
      },
      yaxis2: {
        title: {
          text: "IR intensity / km·mol⁻¹",
          font: {
            size: 14,
            color: colors.text
          }
        },
        range: [0, kmMolUpper],
        overlaying: "y",
        side: "right",
        showline: true,
        linecolor: colors.axis,
        linewidth: 1.4,
        ticks: "inside",
        ticklen: 6,
        tickwidth: 1.1,
        tickcolor: colors.axis,
        tickfont: {
          color: colors.text
        },
        showgrid: false,
        zeroline: false
      },
      annotations,
      showlegend: false,
      hovermode: "closest"
    };
  }

  function buildLayout({ title, spectrum, experimental, ui, annotations, colors }) {
    const xRange = buildXRange(spectrum, ui);
    const yRange = buildYRange(spectrum, ui);
    const showLegend = shouldShowExperimental(experimental, ui);

    return {
      title: {
        text: title,
        x: 0.5,
        xanchor: "center",
        font: {
          size: 20,
          color: colors.text
        }
      },
      paper_bgcolor: colors.paperBg,
      plot_bgcolor: colors.plotBg,
      margin: {
        t: 72,
        r: 30,
        b: 96,
        l: 82
      },
      xaxis: {
        title: {
          text: "Wavenumber / cm⁻¹",
          font: {
            size: 15,
            color: colors.text
          }
        },
        range: xRange,
        showline: true,
        linecolor: colors.axis,
        linewidth: 1.4,
        mirror: true,
        ticks: "inside",
        ticklen: 6,
        tickwidth: 1.1,
        tickcolor: colors.axis,
        tickfont: {
          color: colors.text
        },
        showgrid: Boolean(ui.showGrid),
        gridcolor: colors.grid,
        zeroline: false,
        dtick: 500
      },
      yaxis: {
        title: {
          text: ui.spectrumMode === "transmission"
            ? "Transmittance / %"
            : "Intensity / normalized units",
          font: {
            size: 15,
            color: colors.text
          }
        },
        range: yRange,
        showline: true,
        linecolor: colors.axis,
        linewidth: 1.4,
        mirror: true,
        ticks: "inside",
        ticklen: 6,
        tickwidth: 1.1,
        tickcolor: colors.axis,
        tickfont: {
          color: colors.text
        },
        showgrid: false,
        zeroline: false,
        ...(ui.spectrumMode === "transmission"
          ? {
              tickmode: "array",
              tickvals: [0, 20, 40, 60, 80, 100],
              ticktext: ["0", "20", "40", "60", "80", "100"]
            }
          : {})
      },
      annotations,
      showlegend: showLegend,
      legend: {
        x: 0.98,
        y: 0.02,
        xanchor: "right",
        yanchor: "bottom",
        bgcolor: colors.legendBg,
        bordercolor: colors.legendBorder,
        borderwidth: 1,
        font: {
          size: 12,
          color: colors.text
        }
      },
      hovermode: "closest"
    };
  }

  function shouldShowExperimental(experimental, ui) {
    return Boolean(
      ui.showExperimental &&
      experimental &&
      Array.isArray(experimental.x) &&
      experimental.x.length > 0
    );
  }

  function getDisplayedSpectrumY(spectrum, ui) {
    if (ui.spectrumMode === "transmission") {
      const baseline = getTransmissionBaseline(spectrum);

      return spectrum.unitAbsorptionY.map((value) => {
        return unitAbsorptionToTransmittance(value, baseline);
      });
    }

    return spectrum.absorptionY;
  }

  function getDisplayedExperimentalY(experimental, ui) {
    if (ui.normalizeExperimental) {
      const baselineNormalizedT = normalizeExperimentalTransmittance(
        experimental.transmittanceY
      );

      const absorbanceY = transmittanceToAbsorbance(baselineNormalizedT);
      const normalizedAbsorbanceY = normalizeArray(absorbanceY);

      if (ui.spectrumMode === "transmission") {
        return normalizedAbsorbanceY.map((value) => {
          return 100 - value * 100;
        });
      }

      const normFactor = Number(ui.normFactor) > 0 ? Number(ui.normFactor) : 1;

      return normalizedAbsorbanceY.map((value) => {
        return value * normFactor;
      });
    }

    if (ui.spectrumMode === "transmission") {
      return experimental.transmittanceY;
    }

    const normFactor = Number(ui.normFactor) > 0 ? Number(ui.normFactor) : 1;

    return experimental.normalizedAbsorbanceY.map((value) => {
      return value * normFactor;
    });
  }
  
  function normalizeExperimentalTransmittance(transmittanceY) {
    if (!Array.isArray(transmittanceY) || transmittanceY.length === 0) {
      return [];
    }

    const finiteValues = transmittanceY
      .map(Number)
      .filter(Number.isFinite);

    if (finiteValues.length === 0) {
      return transmittanceY.map(() => 100);
    }

    /*
      Use a high percentile instead of max to avoid single-point outliers.
      This maps the experimental baseline approximately to 100 %T.
    */
    const baseline = percentile(finiteValues, 0.98);

    if (!Number.isFinite(baseline) || baseline <= 0) {
      return transmittanceY;
    }

    return transmittanceY.map((value) => {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return NaN;
      }

      return clamp(number / baseline * 100, 0, 100);
    });
  }

  function transmittanceToAbsorbance(transmittanceY) {
    return transmittanceY.map((t) => {
      const safeT = Math.max(Number(t), 1e-9);
      return -Math.log10(safeT / 100);
    });
  }

  function normalizeArray(values) {
    const finiteValues = values.filter(Number.isFinite);

    if (finiteValues.length === 0) {
      return values.map(() => 0);
    }

    const maxValue = Math.max(...finiteValues);

    if (maxValue <= 0) {
      return values.map(() => 0);
    }

    return values.map((value) => {
      return Number.isFinite(value) ? value / maxValue : 0;
    });
  }

  function percentile(values, p) {
    if (!Array.isArray(values) || values.length === 0) {
      return NaN;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) {
      return sorted[lower];
    }

    const weight = index - lower;

    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  function getDisplayedGaussianY(gaussian, spectrum, ui) {
    if (ui.spectrumMode === "transmission") {
      const normFactor = Number(ui.normFactor) > 0 ? Number(ui.normFactor) : 1;
      const baseline = getTransmissionBaseline(spectrum);

      return gaussian.y.map((value) => {
        const unitValue = value / normFactor;
        return unitAbsorptionToTransmittance(unitValue, baseline);
      });
    }

    return gaussian.y;
  }

  function getDisplayedStickDepth(stick, spectrum, ui) {
    if (ui.spectrumMode === "transmission") {
      const rawMax = spectrum.stats.rawMax > 0 ? spectrum.stats.rawMax : 1;
      const baseline = getTransmissionBaseline(spectrum);
      const denominator = Math.max(1 - baseline, 1e-12);

      return clamp(stick.rawIntensity / rawMax / denominator, 0, 1) * 100;
    }

    return stick.y;
  }

  function getDisplayedPeakY(spectrum, peak, ui) {
    if (ui.spectrumMode === "transmission") {
      const baseline = getTransmissionBaseline(spectrum);

      return unitAbsorptionToTransmittance(
        spectrum.unitAbsorptionY[peak.index],
        baseline
      );
    }

    return spectrum.absorptionY[peak.index];
  }

  function getTransmissionBaseline(spectrum) {
    const y = spectrum.unitAbsorptionY;

    if (!Array.isArray(y) || y.length === 0) {
      return 0;
    }

    let minimum = Infinity;

    for (const value of y) {
      if (Number.isFinite(value) && value < minimum) {
        minimum = value;
      }
    }

    if (!Number.isFinite(minimum)) {
      return 0;
    }

    /*
      Use the global minimum as display baseline.
      This avoids suppressing weak peaks when a wavenumber shift moves
      strong Gaussian tails close to the spectrum edges.
    */
    return minimum;
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

  function buildXRange(spectrum, ui) {
    const fullMin = spectrum.stats.xMin ?? 0;
    const fullMax = spectrum.stats.xMax ?? 4000;

    let min = Number.isFinite(ui.rangeMin) ? ui.rangeMin : fullMin;
    let max = Number.isFinite(ui.rangeMax) ? ui.rangeMax : fullMax;

    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }

    if (ui.axisDirection === "highToLow") {
      return [max, min];
    }

    return [min, max];
  }

  function buildYRange(spectrum, ui) {
    if (ui.spectrumMode === "transmission") {
      /*
        Transmission is displayed as percent transmittance.
        The upper axis limit is exactly 100 %.
        Extra space below 0 % is reserved for vertical peak labels.
      */
      return [-30, 100];
    }

    const factor = Number(ui.normFactor);
    const maxY = Number.isFinite(factor) && factor > 0
      ? factor
      : spectrum.stats.normalizedMax;

    const padding = maxY * 0.12;

    return [0, maxY + padding];
  }

  function buildPlotTitle(parsed) {
    if (!parsed) {
      return "IR spectrum";
    }

    if (parsed.filename) {
      return parsed.filename;
    }

    return "IR spectrum";
  }

  function buildExportFilename(parsed, fallback) {
    if (!parsed || !parsed.filename) {
      return fallback;
    }

    return parsed.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.-]+/g, "_");
  }

  function getThemeColors(dark) {
    if (dark) {
      return {
        paperBg: "#1a222b",
        plotBg: "#1a222b",
        text: "#e6edf3",
        axis: "#e6edf3",
        grid: "rgba(230,237,243,0.12)",
        spectrum: "#7fb3d5",
        sticks: "#f1948a",
        gaussian: "rgba(159,176,191,0.55)",
        peak: "#f1948a",
        experimental: "#d1d5db",
        experimentalFill: "rgba(209,213,219,0.08)",
        legendBg: "rgba(26,34,43,0.90)",
        legendBorder: "rgba(230,237,243,0.15)"
      };
    }

    return {
      paperBg: "#ffffff",
      plotBg: "#ffffff",
      text: "#1f2a33",
      axis: "#1f2a33",
      grid: "rgba(31,42,51,0.10)",
      spectrum: "#1a5276",
      sticks: "#922b21",
      gaussian: "rgba(91,107,121,0.45)",
      peak: "#922b21",
      experimental: "#4b5563",
      experimentalFill: "rgba(75,85,99,0.07)",
      legendBg: "rgba(255,255,255,0.88)",
      legendBorder: "rgba(31,42,51,0.15)"
    };
  }

  function isDarkMode() {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }

  return {
    renderPlot
  };
})();