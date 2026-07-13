"use strict";

window.ORCAIR_ORCA_IMPORT = (() => {
  const NUMBER_PATTERN = "[-+]?(?:\\d+\\.\\d*|\\.\\d+|\\d+)(?:[Ee][-+]?\\d+)?";
  const NUMBER_RE = new RegExp(NUMBER_PATTERN, "g");

  function parseOrcaOutput(text, filename = "") {
    /*
      Entry point used by app.js. Auto-detects whether the file is an
      ORCA or a Gaussian output and dispatches to the matching parser.
      Both parsers return the same object shape so the rest of the app
      (spectrum.js, plot.js, export.js, app.js info box) needs no changes.
    */
    const format = detectFileFormat(text);

    if (format === "gaussian") {
      return parseGaussianOutput(text, filename);
    }

    return parseOrcaFormat(text, filename);
  }

  function detectFileFormat(text) {
    /*
      Cheap signature checks, most specific first. Gaussian logs always
      contain the "Entering Gaussian System" banner or a
      "Gaussian NN, Revision X" line near the top; ORCA outputs contain
      the "O   R   C   A" banner or a "Program Version" line.
    */
    if (
      /Entering Gaussian System/i.test(text) ||
      /Gaussian\s+\d+\s*,\s*Revision/i.test(text) ||
      /This is part of the Gaussian/i.test(text)
    ) {
      return "gaussian";
    }

    if (
      /\*\s*O\s+R\s+C\s+A\s*\*/.test(text) ||
      /Program Version/i.test(text) ||
      /IR SPECTRUM/.test(text)
    ) {
      return "orca";
    }

    /*
      Fallback: a Gaussian freq job always prints this exact banner line
      right above the frequency blocks, even if the version banner above
      was stripped from the file for some reason.
    */
    if (/Harmonic frequencies \(cm\*\*-1\)/i.test(text)) {
      return "gaussian";
    }

    /*
      Last-resort fallback for partial/incomplete Gaussian snippets that
      contain neither the version banner nor the section header (e.g. a
      copy-pasted excerpt) - the "Frequencies ---"/"IR Inten(sities) ---"
      line pair is distinctive enough to identify Gaussian's format on
      its own.
    */
    if (
      /^\s*Frequencies\s*-{2,}\s+[-+]?\d/im.test(text) &&
      /^\s*IR\s+Inten(?:sities)?\s*-{2,}\s+[-+]?\d/im.test(text)
    ) {
      return "gaussian";
    }

    return "orca";
  }

  function parseOrcaFormat(text, filename = "") {
    const lines = text.split(/\r?\n/);

    const versionInfo = detectOrcaVersion(text);
    const frequencyScaling = parseFrequencyScalingFactor(lines);
    const vibrational = parseVibrationalFrequencies(lines);
    const ir = parseIRSpectrum(lines, versionInfo.major);

    if (!ir.found) {
      throw new Error("IR SPECTRUM section not found.");
    }

    if (ir.rows.length === 0) {
      throw new Error("IR SPECTRUM section found, but no IR data rows could be parsed.");
    }

    const imaginaryModes = collectImaginaryModes(vibrational.rows, ir.rows);

    const frequencies = ir.rows.map((row) => row.frequency);
    const intensities = ir.rows.map((row) => row.intensity);
    const modes = ir.rows.map((row) => row.mode);

    const warnings = [];

    if (frequencyScaling.invalid) {
      warnings.push(
        "Invalid ORCA frequency scaling factor detected. Assuming 1.0."
      );
    }

    if (imaginaryModes.length > 0) {
      warnings.push(
        `${imaginaryModes.length} negative frequencies / imaginary modes detected. Spectrum generation continues.`
      );
    }

    const minFrequency = Math.min(...frequencies);
    const maxFrequency = Math.max(...frequencies);
    const maxIntensity = Math.max(...intensities);

    return {
      filename,

      program: "ORCA",
      orcaVersion: versionInfo.version,
      orcaMajorVersion: versionInfo.major,

      frequencyScaling,

      irSectionFound: true,
      irHeader: ir.headerTokens,
      intensityColumnIndex: ir.intensityColumnIndex,
      intensityColumnName: ir.intensityColumnName,

      modes,
      frequencies,
      intensities,
      rows: ir.rows,

      vibrationalFrequenciesFound: vibrational.found,
      vibrationalFrequencies: vibrational.rows,

      imaginaryModes,
      warnings,

      stats: {
        modesParsed: ir.rows.length,
        minFrequency,
        maxFrequency,
        maxIntensity
      }
    };
  }

  function detectOrcaVersion(text) {
    const match = text.match(/Program Version\s+([0-9]+(?:\.[0-9]+)*)/i);

    if (!match) {
      return {
        version: null,
        major: null
      };
    }

    const version = match[1];
    const major = Number.parseInt(version.split(".")[0], 10);

    return {
      version,
      major: Number.isFinite(major) ? major : null
    };
  }

  function parseFrequencyScalingFactor(lines) {
    const scalingRe = new RegExp(
      "Scaling\\s+factor\\s+for\\s+frequencies\\s*=\\s*(" +
        NUMBER_PATTERN +
        ")",
      "i"
    );

    for (const line of lines) {
      const match = line.match(scalingRe);

      if (!match) {
        continue;
      }

      const factor = Number(match[1]);
      const rawLine = line.trim();
      const alreadyApplied = /already\s+applied/i.test(rawLine);

      if (!Number.isFinite(factor) || factor <= 0) {
        return {
          found: false,
          factor: 1.0,
          alreadyApplied: false,
          rawLine,
          invalid: true
        };
      }

      return {
        found: true,
        factor,
        alreadyApplied,
        rawLine,
        invalid: false
      };
    }

    return {
      found: false,
      factor: 1.0,
      alreadyApplied: false,
      rawLine: null,
      invalid: false
    };
  }

  function parseVibrationalFrequencies(lines) {
    const rows = [];

    let inSection = false;
    let dataStarted = false;

    const modeFreqRe = new RegExp(
      "^\\s*(\\d+)\\s*:\\s*(" + NUMBER_PATTERN + ")\\s*cm\\*\\*-1",
      "i"
    );

    for (const line of lines) {
      const trimmed = line.trim();

      if (!inSection) {
        if (trimmed === "VIBRATIONAL FREQUENCIES") {
          inSection = true;
        }
        continue;
      }

      const match = line.match(modeFreqRe);

      if (match) {
        dataStarted = true;

        rows.push({
          mode: Number.parseInt(match[1], 10),
          frequency: Number(match[2])
        });

        continue;
      }

      if (!dataStarted) {
        continue;
      }

      if (trimmed === "") {
        break;
      }

      if (
        trimmed === "IR SPECTRUM" ||
        trimmed === "NORMAL MODES" ||
        trimmed.includes("THERMOCHEMISTRY")
      ) {
        break;
      }
    }

    return {
      found: inSection,
      rows
    };
  }

  function parseIRSpectrum(lines, orcaMajorVersion = null) {
    const rows = [];

    let inSection = false;
    let dataStarted = false;

    let headerTokens = null;
    let freqColumnIndex = null;
    let intensityColumnIndex = null;
    let intensityColumnName = null;

    const dataLineRe = /^\s*(\d+)\s*:\s*(.*)$/;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!inSection) {
        if (trimmed === "IR SPECTRUM") {
          inSection = true;
        }
        continue;
      }

      if (trimmed.startsWith("The first")) {
        break;
      }

      if (isLikelyIRHeaderLine(trimmed)) {
        headerTokens = splitTokens(trimmed);

        freqColumnIndex = findFrequencyColumn(headerTokens);
        intensityColumnIndex = findIntensityColumn(headerTokens);

        if (intensityColumnIndex !== null) {
          intensityColumnName = headerTokens[intensityColumnIndex];
        }

        continue;
      }

      const dataMatch = line.match(dataLineRe);

      if (dataMatch) {
        dataStarted = true;

        const mode = Number.parseInt(dataMatch[1], 10);
        const rest = removeVectorPart(dataMatch[2]);
        const numericTokens = extractNumbers(rest);

        /*
          Data tokens are represented as:
          token 0 = "mode:"
          token 1 = frequency
          token 2 = eps or intensity depending on ORCA/header
          token 3 = Int for ORCA 5/6 with header:
                    Mode freq eps Int T**2 ...
        */
        const dataTokens = [`${mode}:`, ...numericTokens];

        const freqIndex = freqColumnIndex ?? 1;
        const intIndex =
          intensityColumnIndex ??
          fallbackIntensityColumnIndex(orcaMajorVersion);

        const frequency = Number(dataTokens[freqIndex]);
        const intensity = Number(dataTokens[intIndex]);

        if (Number.isFinite(frequency) && Number.isFinite(intensity)) {
          rows.push({
            mode,
            frequency,
            intensity,
            rawTokens: dataTokens,
            rawLine: line
          });
        }

        continue;
      }

      if (!dataStarted) {
        continue;
      }

      if (trimmed === "") {
        break;
      }

      if (
        trimmed.includes("SPECTRUM") ||
        trimmed.includes("NORMAL MODES") ||
        trimmed.includes("THERMOCHEMISTRY")
      ) {
        break;
      }
    }

    return {
      found: inSection,
      rows,
      headerTokens,
      freqColumnIndex,
      intensityColumnIndex:
        intensityColumnIndex ?? fallbackIntensityColumnIndex(orcaMajorVersion),
      intensityColumnName:
        intensityColumnName ?? "fallback"
    };
  }

  function isLikelyIRHeaderLine(line) {
    if (!line) return false;

    const hasMode = /\bMode\b/i.test(line);
    const hasFreq = /\bfreq\b|\bfrequency\b/i.test(line);
    const hasIntensity =
      /\bInt\b/i.test(line) ||
      /\bIntensity\b/i.test(line) ||
      /\bIR\s*Int/i.test(line);

    return hasMode && hasFreq && hasIntensity;
  }

  function splitTokens(line) {
    return line.trim().split(/\s+/);
  }

  function findFrequencyColumn(headerTokens) {
    if (!headerTokens) return null;

    for (let i = 0; i < headerTokens.length; i++) {
      const token = normalizeHeaderToken(headerTokens[i]);

      if (
        token === "freq" ||
        token === "frequency" ||
        token.startsWith("freq")
      ) {
        return i;
      }
    }

    return null;
  }

  function findIntensityColumn(headerTokens) {
    if (!headerTokens) return null;

    for (let i = 0; i < headerTokens.length; i++) {
      const token = normalizeHeaderToken(headerTokens[i]);

      /*
        Preferred ORCA IR intensity column:
        Int in km/mol.

        For your ORCA 5 example:
        Mode freq eps Int T**2 TX TY TZ
                      ^ index 3
      */
      if (
        token === "int" ||
        token === "intensity" ||
        token === "irint" ||
        token === "irintensity"
      ) {
        return i;
      }
    }

    return null;
  }

  function normalizeHeaderToken(token) {
    return String(token)
      .trim()
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();
  }

  function fallbackIntensityColumnIndex(orcaMajorVersion) {
    /*
      Fallback only if no usable IR header was found.

      Historical behaviour from the Python script:
      ORCA 5/6: intensity at token index 3
      ORCA 3/4: intensity at token index 2

      Data token index includes mode as token 0:
      6:  15.19  0.000033  0.17 ...
      0   1      2         3
    */

    if (orcaMajorVersion === 3 || orcaMajorVersion === 4) {
      return 2;
    }

    return 3;
  }

  function removeVectorPart(line) {
    /*
      Removes the transition dipole vector part:
      (-0.001989 -0.011548 -0.023317)

      We only want the scalar columns before it.
    */
    return line.split("(")[0];
  }

  function extractNumbers(text) {
    const matches = String(text).match(NUMBER_RE);
    return matches ?? [];
  }

  function collectImaginaryModes(vibrationalRows, irRows, irSourceLabel = "IR SPECTRUM") {
    const byMode = new Map();

    for (const row of vibrationalRows) {
      if (row.frequency < 0) {
        byMode.set(row.mode, {
          mode: row.mode,
          frequency: row.frequency,
          source: "VIBRATIONAL FREQUENCIES"
        });
      }
    }

    for (const row of irRows) {
      if (row.frequency < 0 && !byMode.has(row.mode)) {
        byMode.set(row.mode, {
          mode: row.mode,
          frequency: row.frequency,
          source: irSourceLabel
        });
      }
    }

    return Array.from(byMode.values()).sort((a, b) => a.mode - b.mode);
  }

  function parseGaussianOutput(text, filename = "") {
    const lines = text.split(/\r?\n/);

    const versionInfo = detectGaussianVersion(text);
    const ir = parseGaussianFrequencies(lines);

    if (!ir.found) {
      throw new Error(
        "No 'Harmonic frequencies' section found. Is this a Gaussian frequency (Freq) job output?"
      );
    }

    if (ir.rows.length === 0) {
      throw new Error(
        "'Harmonic frequencies' section found, but no 'IR Inten' data could be parsed. Was the job run with IR intensities (plain Freq, not e.g. Freq=ReadFC without IR)?"
      );
    }

    const imaginaryModes = collectImaginaryModes([], ir.rows, "Harmonic frequencies");

    const frequencies = ir.rows.map((row) => row.frequency);
    const intensities = ir.rows.map((row) => row.intensity);
    const modes = ir.rows.map((row) => row.mode);

    const warnings = [];

    if (imaginaryModes.length > 0) {
      warnings.push(
        `${imaginaryModes.length} negative frequencies / imaginary modes detected. Spectrum generation continues.`
      );
    }

    const minFrequency = Math.min(...frequencies);
    const maxFrequency = Math.max(...frequencies);
    const maxIntensity = Math.max(...intensities);

    return {
      filename,

      program: "Gaussian",

      /*
        Kept as orcaVersion/orcaMajorVersion (rather than introducing new
        field names) so app.js's existing info-box code works unchanged
        for both program types.
      */
      orcaVersion: versionInfo.version,
      orcaMajorVersion: versionInfo.major,

      /*
        Gaussian output files don't carry a separate "apply this scaling
        factor" directive the way ORCA can. Scaling in this app is always
        an app-side, user-controlled setting for Gaussian files.
      */
      frequencyScaling: {
        found: false,
        factor: 1.0,
        alreadyApplied: false,
        rawLine: null,
        invalid: false
      },

      irSectionFound: true,
      irHeader: ["Frequencies", "Red.", "masses", "Frc", "consts", "IR", "Inten"],
      intensityColumnIndex: null,
      intensityColumnName: "IR Inten (km/mol)",

      modes,
      frequencies,
      intensities,
      rows: ir.rows,

      vibrationalFrequenciesFound: false,
      vibrationalFrequencies: [],

      imaginaryModes,
      warnings,

      stats: {
        modesParsed: ir.rows.length,
        minFrequency,
        maxFrequency,
        maxIntensity
      }
    };
  }

  function detectGaussianVersion(text) {
    const match = text.match(/Gaussian\s+(\d+)\s*,\s*Revision\s+([A-Za-z0-9.+-]+)/i);

    if (!match) {
      return {
        version: null,
        major: null
      };
    }

    const major = Number.parseInt(match[1], 10);

    return {
      version: `${match[1]}, Revision ${match[2]}`,
      major: Number.isFinite(major) ? major : null
    };
  }

  function parseGaussianFrequencies(lines) {
    /*
      Gaussian frequency block layout (repeats in groups of up to 3, or
      more with HPModes, modes per block). Two label styles exist
      depending on print settings:

      Standard precision:
        Frequencies --     30.3513                38.2869                54.9623
        Red. masses --      4.6426                 3.9481                 4.4136
        Frc consts  --      0.0025                 0.0034                 0.0079
        IR Inten    --      0.5524                 6.5809                 0.9292
         Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z

      HPModes (freq=HPModes), higher precision, full-word labels, three
      dashes, and a differently-worded displacement table header:
        Frequencies ---   487.4740  487.4740 1269.3077 2381.0728
        Reduced masses ---    12.8774   12.8774   15.9949   12.8774
        Force constants ---     1.8029    1.8029   15.1833   43.0153
        IR Intensities ---     9.2871    9.2871    0.0000   88.9346
        Coord Atom Element:

      With freq=HPModes, Gaussian prints the whole "Harmonic frequencies"
      section TWICE back-to-back: first the HPModes (high precision)
      block, then the ordinary standard-precision block for the exact
      same modes. To avoid double-counting every mode (and therefore
      doubling every peak once broadened/summed), parsing stops as soon
      as a second "Harmonic frequencies" header is seen after the first
      block has already produced rows - only the first (more precise,
      when present) block is kept.

      "Low frequencies ---" (translation/rotation residuals, printed once
      near the top of the section, before any per-mode block) is
      intentionally NOT matched, since the regex requires "Frequencies"
      to start right after leading whitespace - "Low" would be in the way.
    */
    const rows = [];

    let found = false;
    let modeCounter = 0;
    let pendingFrequencies = null;

    const freqLineRe = /^\s*Frequencies\s*-{2,}\s+(.+)$/i;
    const irLineRe = /^\s*IR\s+Inten(?:sities)?\s*-{2,}\s+(.+)$/i;
    const atomTableRe = /^\s*(?:Atom\s+AN\s+X\s+Y\s+Z|Coord\s+Atom\s+Element)/i;

    for (const line of lines) {
      if (/^\s*Harmonic frequencies/i.test(line)) {
        if (rows.length > 0) {
          /*
            Second (duplicate, lower-precision) section from HPModes -
            stop here and keep only the first block's rows.
          */
          break;
        }

        found = true;
        continue;
      }

      const freqMatch = line.match(freqLineRe);

      if (freqMatch) {
        found = true;
        pendingFrequencies = extractNumbers(freqMatch[1]).map(Number);
        continue;
      }

      if (!pendingFrequencies) {
        continue;
      }

      const irMatch = line.match(irLineRe);

      if (irMatch) {
        const irValues = extractNumbers(irMatch[1]).map(Number);
        const count = Math.min(pendingFrequencies.length, irValues.length);

        for (let i = 0; i < count; i++) {
          modeCounter += 1;

          rows.push({
            mode: modeCounter,
            frequency: pendingFrequencies[i],
            intensity: irValues[i],
            rawLine: line
          });
        }

        pendingFrequencies = null;
        continue;
      }

      if (atomTableRe.test(line)) {
        /*
          Reached the displacement-vector table without ever finding an
          "IR Inten" line for this block (e.g. intensities weren't
          computed). Drop the pending block and keep scanning.
        */
        pendingFrequencies = null;
      }
    }

    return {
      found,
      rows
    };
  }

  return {
    parseOrcaOutput,
    parseOrcaFormat,
    parseGaussianOutput,
    detectFileFormat
  };
})();