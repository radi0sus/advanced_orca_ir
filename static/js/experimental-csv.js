"use strict";

window.ORCAIR_EXPERIMENTAL_CSV = (() => {
  function parseExperimentalCsv(text, filename = "") {
    const rawLines = String(text)
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);

    const lines = rawLines
      .map((line) => line.trim())
      .filter((line) => isMeaningfulLine(line));

    if (lines.length === 0) {
      throw new Error("Experimental CSV is empty.");
    }

    const delimiter = detectDelimiter(lines);
    const firstTokens = splitLine(lines[0], delimiter);
    const hasHeader = detectHeader(firstTokens, delimiter);

    let xColumn = null;
    let yColumn = null;
    let headerTokens = null;

    if (hasHeader) {
      headerTokens = firstTokens;
      xColumn = findXColumn(headerTokens);
      yColumn = findYColumn(headerTokens, xColumn);
    }

    const startIndex = hasHeader ? 1 : 0;
    const points = [];
    const warnings = [];

    for (let i = startIndex; i < lines.length; i++) {
      const tokens = splitLine(lines[i], delimiter);

      const parsed = parseDataRow(tokens, {
        delimiter,
        xColumn,
        yColumn
      });

      if (!parsed) {
        continue;
      }

      points.push({
        x: parsed.x,
        y: parsed.y,
        sourceLine: i + 1
      });
    }

    if (points.length === 0) {
      throw new Error("No numeric data rows found in experimental CSV.");
    }

    points.sort((a, b) => a.x - b.x);

    const x = points.map((point) => point.x);
    const transmittanceY = points.map((point) => point.y);
    const absorbanceY = transmittanceToAbsorbance(transmittanceY);
    const normalizedAbsorbanceY = normalizeArray(absorbanceY);

    if (hasHeader && (xColumn === null || yColumn === null)) {
      warnings.push(
        "Header detected, but columns could not be identified reliably. Used first two numeric columns."
      );
    }

    return {
      filename,
      delimiter,
      delimiterLabel: delimiterToLabel(delimiter),
      hasHeader,
      headerTokens,

      x,
      transmittanceY,
      absorbanceY,
      normalizedAbsorbanceY,

      yType: "transmittance_percent",

      stats: {
        points: points.length,
        xMin: Math.min(...x),
        xMax: Math.max(...x),
        yMin: Math.min(...transmittanceY),
        yMax: Math.max(...transmittanceY)
      },

      warnings
    };
  }

  function isMeaningfulLine(line) {
    if (!line) {
      return false;
    }

    if (line.startsWith("#")) {
      return false;
    }

    if (line.startsWith("//")) {
      return false;
    }

    return true;
  }

  function detectDelimiter(lines) {
    const sample = lines.slice(0, Math.min(lines.length, 20));

    const candidates = [
      {
        delimiter: ",",
        score: 0
      },
      {
        delimiter: ";",
        score: 0
      },
      {
        delimiter: "\t",
        score: 0
      }
    ];

    for (const line of sample) {
      for (const candidate of candidates) {
        const count = countOccurrences(line, candidate.delimiter);

        if (count > 0) {
          candidate.score += count;
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);

    if (candidates[0].score > 0) {
      return candidates[0].delimiter;
    }

    return "whitespace";
  }

  function countOccurrences(text, needle) {
    if (needle === "\t") {
      return (text.match(/\t/g) || []).length;
    }

    return text.split(needle).length - 1;
  }

  function splitLine(line, delimiter) {
    if (delimiter === "whitespace") {
      return line.trim().split(/\s+/).map(cleanToken);
    }

    return line.split(delimiter).map(cleanToken);
  }

  function cleanToken(token) {
    return String(token)
      .trim()
      .replace(/^["']/, "")
      .replace(/["']$/, "");
  }

  function detectHeader(tokens, delimiter) {
    if (!tokens || tokens.length < 2) {
      return true;
    }

    const first = parseNumber(tokens[0], delimiter);
    const second = parseNumber(tokens[1], delimiter);

    return !(Number.isFinite(first) && Number.isFinite(second));
  }

  function findXColumn(headerTokens) {
    if (!Array.isArray(headerTokens)) {
      return null;
    }

    for (let i = 0; i < headerTokens.length; i++) {
      const token = normalizeHeaderToken(headerTokens[i]);

      if (
        token.includes("wavenumber") ||
        token === "wn" ||
        token.includes("cm1") ||
        token.includes("cm-1") ||
        token.includes("cm**-1")
      ) {
        return i;
      }
    }

    return null;
  }

  function findYColumn(headerTokens, xColumn) {
    if (!Array.isArray(headerTokens)) {
      return null;
    }

    for (let i = 0; i < headerTokens.length; i++) {
      if (i === xColumn) {
        continue;
      }

      const token = normalizeHeaderToken(headerTokens[i]);

      if (
        token.includes("transmittance") ||
        token === "t" ||
        token === "pctt" ||
        token === "percentt" ||
        token.includes("%t") ||
        token.includes("transmission")
      ) {
        return i;
      }
    }

    for (let i = 0; i < headerTokens.length; i++) {
      if (i === xColumn) {
        continue;
      }

      const token = normalizeHeaderToken(headerTokens[i]);

      if (
        token === "y" ||
        token.includes("intensity") ||
        token.includes("absorbance") ||
        token.includes("abs")
      ) {
        return i;
      }
    }

    return null;
  }

  function normalizeHeaderToken(token) {
    return String(token)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace("⁻", "-")
      .replace(/[^a-z0-9%*._-]/g, "");
  }

  function parseDataRow(tokens, options) {
    const delimiter = options.delimiter;
    const xColumn = options.xColumn;
    const yColumn = options.yColumn;

    if (
      xColumn !== null &&
      yColumn !== null &&
      tokens.length > Math.max(xColumn, yColumn)
    ) {
      const x = parseNumber(tokens[xColumn], delimiter);
      const y = parseNumber(tokens[yColumn], delimiter);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        return {
          x,
          y
        };
      }
    }

    const numericValues = [];

    for (const token of tokens) {
      const value = parseNumber(token, delimiter);

      if (Number.isFinite(value)) {
        numericValues.push(value);
      }
    }

    if (numericValues.length < 2) {
      return null;
    }

    return {
      x: numericValues[0],
      y: numericValues[1]
    };
  }

  function parseNumber(value, delimiter) {
    let text = String(value)
      .trim()
      .replace("−", "-");

    if (text === "") {
      return NaN;
    }

    /*
      Allow decimal comma only if comma is not the column delimiter.
      This is useful for semicolon-separated European CSV files:
      4000;98,5
    */
    if (delimiter !== "," && /^[+-]?\d+,\d+(?:[Ee][+-]?\d+)?$/.test(text)) {
      text = text.replace(",", ".");
    }

    const number = Number(text);

    return Number.isFinite(number) ? number : NaN;
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

  function delimiterToLabel(delimiter) {
    if (delimiter === "\t") {
      return "tab";
    }

    if (delimiter === "whitespace") {
      return "space/whitespace";
    }

    return delimiter;
  }

  return {
    parseExperimentalCsv
  };
})();
