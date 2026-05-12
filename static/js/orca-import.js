"use strict";

window.ORCAIR_ORCA_IMPORT = (() => {
  const NUMBER_PATTERN = "[-+]?(?:\\d+\\.\\d*|\\.\\d+|\\d+)(?:[Ee][-+]?\\d+)?";
  const NUMBER_RE = new RegExp(NUMBER_PATTERN, "g");

  function parseOrcaOutput(text, filename = "") {
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

  function collectImaginaryModes(vibrationalRows, irRows) {
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
          source: "IR SPECTRUM"
        });
      }
    }

    return Array.from(byMode.values()).sort((a, b) => a.mode - b.mode);
  }

  return {
    parseOrcaOutput
  };
})();