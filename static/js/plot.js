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

    if (!spectrum) {
      return;
    }

    UI.clearPlotPlaceholder();

    const plotElement = UI.$("plot");
    const dark = isDarkMode();

    const colors = getThemeColors(dark);
    const traces = buildTraces(spectrum, ui, colors);
    const annotations = ui.showPeaks
      ? buildPeakAnnotations(spectrum, peaks, ui, colors.peak)
      : [];

    const layout = buildLayout({
      title: buildPlotTitle(parsed),
      spectrum,
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

  function buildTraces(spectrum, ui, colors) {
    const traces = [];

    /*
      Draw order:
      1. individual Gaussians in the background
      2. sticks
      3. summed spectrum on top
    */
    if (ui.showGaussians && spectrum.gaussians.length > 0) {
      traces.push(...buildGaussianTraces(spectrum, ui, colors));
    }

    if (ui.showSticks && spectrum.sticks.length > 0) {
      traces.push(buildStickTrace(spectrum, ui, colors));
    }

    traces.push(buildSpectrumTrace(spectrum, ui, colors));

    return traces;
  }

  function buildSpectrumTrace(spectrum, ui, colors) {
    const y = getDisplayedSpectrumY(spectrum, ui);

    return {
      x: spectrum.x,
      y,
      type: "scatter",
      mode: "lines",
      name: ui.spectrumMode === "transmission"
        ? "Transmittance"
        : "Absorption",
      line: {
        color: colors.spectrum,
        width: 1.7
      },
      hovertemplate:
        "Wavenumber: %{x:.1f} cm⁻¹<br>" +
        "Y: %{y:.4f}<extra></extra>"
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
        width: 1
      },
      opacity: 0.75,
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function buildPeakAnnotations(spectrum, peaks, ui, peakColor) {
    const annotations = [];
    const filteredPeaks = thinPeakLabels(peaks, 15);

    for (const peak of filteredPeaks) {
      const y = getDisplayedPeakY(spectrum, peak, ui);

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

  function buildLayout({ title, spectrum, ui, annotations, colors }) {
    const xRange = buildXRange(spectrum, ui);
    const yRange = buildYRange(spectrum, ui);

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
      showlegend: false,
      hovermode: "closest"
    };
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

    const first = Number.isFinite(y[0]) ? y[0] : 0;
    const last = Number.isFinite(y[y.length - 1]) ? y[y.length - 1] : 0;

    /*
      Use the larger edge tail as display baseline.
      This makes the spectrum edges start at or clamp to 100 %.
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
        peak: "#f1948a"
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
      peak: "#922b21"
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