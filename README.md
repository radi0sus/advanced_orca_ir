> [!TIP]
> **Advanced ORCA IR Viewer** is available as a static web app with interactive Plotly spectra, local ORCA output parsing, experimental CSV overlay, peak labels, and PNG/CSV export.  
> 👉 Try it here: https://radi0sus.github.io/advanced_orca_ir/  
> 👉 Original CLI tool: https://github.com/radi0sus/orca_ir

# Advanced ORCA IR Viewer

A browser-based successor to the original [`orca-ir`](https://github.com/radi0sus/orca_ir) Python CLI script for plotting calculated IR spectra from [ORCA](https://orcaforum.kofo.mpg.de) output files.

This version keeps the main idea of the CLI tool:

- read an ORCA output file,
- extract the `IR SPECTRUM` section,
- combine the stick spectrum with a Gaussian- or Lorentzian-broadened spectrum,
- detect and label peaks,
- export the resulting spectrum.

The main difference is that everything now runs **locally in the browser** with an interactive user interface.

Gaussian frequency-job output files (`.log`/`.out`) are also supported and are auto-detected — see [Input files](#input-files) below.

No Python installation is required.

---

## Main additions compared to the CLI tool

### Browser-based workflow

The viewer runs as a static web app via GitHub Pages.

You can open the page, select an ORCA output file, and generate the IR spectrum directly in the browser.

The ORCA file is processed locally. It is not uploaded to a server.

---

### Interactive Plotly visualization

The spectrum is rendered with Plotly and can be interactively inspected.

Supported display options include:

- normalized mode (absorption/intensity or transmittance-style),
- physical ε + km/mol mode (dual-axis, see below),
- Gaussian/Lorentzian broadening toggle (see below),
- high-to-low or low-to-high wavenumber axis,
- adjustable displayed wavenumber range,
- grid toggle,
- stick spectrum toggle,
- peak label toggle,
- single peak components (Gaussian or Lorentzian, depending on the selected broadening),
- filled transparent rainbow peak components.

---

### Live controls

Instead of command-line options or editing variables in the Python script, the web app provides live UI controls for:

- Gaussian/Lorentzian line width / HWHM,
- wavenumber shift,
- normalization factor,
- peak detection prominence,
- minimum peak distance,
- plot mode,
- axis direction,
- visible plot elements.

Changes are applied interactively.

---

### Imaginary mode warning

The app checks the vibrational frequencies for negative frequencies / imaginary modes.

If negative frequencies are found, a warning is shown, but spectrum generation continues.

---

### Gaussian / Lorentzian broadening toggle

The broadening lineshape used to build the spectrum can be switched between
Gaussian (default) and Lorentzian via the **Broadening** control in the
"Spectrum" section.

Both lineshapes are parameterized by the same **HWHM** (half width at half
maximum) slider, and both reach the mode's full peak height at the line
center:

```text
gaussian(x)   = intensity · exp(-ln2 · ((center - x) / HWHM)^2)
lorentzian(x) = intensity · HWHM² / ((center - x)² + HWHM²)
```

The choice affects the broadened sum spectrum, the physical ε + km/mol
curve, single peak components, and filled single peak components
simultaneously — everything derives from the same underlying peak
function. Peak detection, sticks, and the experimental overlay are
unaffected, since they operate on unbroadened or shape-agnostic data.

The current selection is shown in "Info & metadata" (`Lineshape`) and
reflected in the plot subtitle.

---

### Physical y-axis mode (ε + km/mol)

In addition to the normalized display, the app offers a second, physical
y-axis mode showing a dual-axis spectrum in the style of Multiwfn's IR
plots:

- the **left axis** shows the molar absorption coefficient ε in
  L·mol⁻¹·cm⁻¹, as a broadened curve (Gaussian or Lorentzian, depending on
  the selected broadening),
- the **right axis** shows the IR intensity in km/mol, as unbroadened
  sticks at each mode's frequency.

ε is derived from the always-available `Int`/`T**2` values (km/mol) using
an area-normalized conversion, independent of the parsed ORCA version:

```text
epsilon(x) = kmMolCurve(x) × [100 × sqrt(ln2/π) / HWHM]     (Gaussian)
epsilon(x) = kmMolCurve(x) × [100 / (π × HWHM)]              (Lorentzian)
```

This follows the convention used by Multiwfn for IR/Raman/VCD/ROA
spectra (area under the ε(ν) curve equals 100 × intensity in km/mol,
for either lineshape). Both formulas were validated numerically against
Multiwfn reference spectra and matched to 6 significant figures.

Because this mode shows absolute physical quantities rather than a
normalized display, the following controls are not applicable and are
disabled while it is active:

- transmission mode (no physical %T can be derived without a known
  concentration and path length),
- the normalization factor,
- the experimental CSV overlay (which is normalized to a 0–1 scale and
  not on a comparable absolute axis).

The exported CSV and the peaks list always include both the km/mol and ε
values, regardless of which y-axis mode is currently displayed.

---

### Experimental CSV overlay

In addition to ORCA output files, an experimental CSV spectrum can be loaded as an overlay.

Supported CSV features include:

- optional header,
- no-header numeric files,
- comma-separated data,
- semicolon-separated data,
- tab-separated data,
- whitespace-separated data.

The first two numeric columns are used as:

```text
wavenumber, y value
```

The experimental spectrum can be shown together with the calculated ORCA spectrum.

A normalization toggle is available for easier visual comparison.

---

### Export

The web app supports export of:

- PNG of the current Plotly view,
- CSV of the full calculated spectrum.

The CSV export contains:

```text
wn_cm-1, transmittance_percent, abs_norm, abs_scaled, intensity_kmmol, epsilon_Lmolcm
```

Where:

- `wn_cm-1` is the calculated wavenumber axis, including any applied wavenumber shift,
- `transmittance_percent` is the normalized transmittance-style spectrum,
- `abs_norm` is the normalized absorption spectrum with maximum intensity = 1,
- `abs_scaled` is the normalized absorption spectrum multiplied by the selected normalization factor,
- `intensity_kmmol` is the unnormalized, broadened spectrum in km/mol
  (Gaussian or Lorentzian, depending on the selected broadening),
- `epsilon_Lmolcm` is the derived molar absorption coefficient ε in L·mol⁻¹·cm⁻¹ (see "Physical y-axis mode" above).

The last two columns are exported unconditionally, independent of the currently selected y-axis mode.

---

## Quick start

Open the web app:

```text
https://radi0sus.github.io/advanced_orca_ir/
```

Then:

1. Select an ORCA output file.
2. Adjust line width, shift, or display options if needed.
3. Optionally load an experimental CSV spectrum.
4. Export the plot as PNG or the calculated data as CSV.

---

## Input files

### ORCA output

The app expects an ORCA output file containing an `IR SPECTRUM` section.

The parser detects the IR intensity column from the ORCA table header where possible. For typical ORCA 5/6 output, the `Int` column in `km/mol` is used.

Example ORCA section:

```text
-----------
IR SPECTRUM
-----------

 Mode   freq       eps      Int      T**2         TX        TY        TZ
       cm**-1   L/(mol*cm) km/mol    a.u.
----------------------------------------------------------------------------
  6:     15.19   0.000033    0.17  0.000681  (-0.001989 -0.011548 -0.023317)
```

### Gaussian output

The app also accepts a Gaussian output file (`.log`/`.out`, Gaussian 09 and 16 tested) from a frequency (`Freq`) job. The format is auto-detected (no separate upload option needed) from the `Entering Gaussian System` / `Gaussian NN, Revision X` banner, or from the `Frequencies`/`IR Inten(sities)` block itself if only a partial excerpt is present.

The parser reads the `Harmonic frequencies` block, matching each `Frequencies` line to its corresponding `IR Inten(sities)` line (values in km/mol). Both label styles are supported:

Standard precision:

```text
 Frequencies --     30.3513                38.2869                54.9623
 Red. masses --      4.6426                 3.9481                 4.4136
 Frc consts  --      0.0025                 0.0034                 0.0079
 IR Inten    --      0.5524                 6.5809                 0.9292
```

`freq=HPModes` (higher precision, full-word labels, three dashes):

```text
 Frequencies ---   487.4740  487.4740 1269.3077 2381.0728
 Reduced masses ---    12.8774   12.8774   15.9949   12.8774
 Force constants ---     1.8029    1.8029   15.1833   43.0153
 IR Intensities ---     9.2871    9.2871    0.0000   88.9346
```

Notes:

- `Low frequencies ---` (the translation/rotation residuals) is intentionally not treated as a vibrational mode.
- Negative frequencies (imaginary modes) are detected the same way as for ORCA files.
- With `freq=HPModes`, Gaussian prints the whole `Harmonic frequencies` section twice (first the high-precision block, then a standard-precision repeat of the same modes). The parser stops after the first block so modes aren't double-counted.
- Gaussian output files don't carry ORCA-style frequency-scaling directives, so the "ORCA factor found" field is always empty for Gaussian files — any scaling is applied entirely on the app side via the frequency scale factor control.

### Experimental CSV

Experimental CSV files may contain either a header or no header.

Examples:

```csv
wn,%T
4000,99.8
3999,99.7
1700,45.2
```

or:

```csv
4000,99.8
3999,99.7
1700,45.2
```

Semicolon, tab, and whitespace-separated files are also supported.

---

## Relationship to the original CLI tool

The original Python CLI tool is still useful for command-line workflows and scripted processing:

```console
python3 orca-ir.py filename
```

This web app is intended for interactive use and easier sharing via GitHub Pages.

Compared to the CLI version, the web app adds:

- no Python dependency,
- interactive Plotly plots,
- local browser-based file processing,
- experimental CSV overlay,
- live parameter controls,
- modern light/dark interface,
- direct PNG/CSV export from the browser.

---

## Notes

The transmittance display is a normalized transmittance-style representation derived from calculated ORCA intensities. It should not be interpreted as an experimentally simulated absolute percent transmittance spectrum.

The calculated absorption spectrum is normalized to a maximum intensity of 1 before optional scaling.

Experimental spectra are treated as `%T` data for overlay purposes.

---

## Original project

This web app is based on the original `orca-ir` Python script:

```text
https://github.com/radi0sus/orca_ir
```
