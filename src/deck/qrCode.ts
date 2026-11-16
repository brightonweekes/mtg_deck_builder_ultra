export type QrErrorCorrectionLevel = 'L' | 'M';

/**
 * Maximum UTF-8 byte payload supported by ISO/IEC 18004 Model 2 QR codes (Version 40)
 * in Byte mode (`0100`) for each supported error-correction level.
 */
export const QR_MAX_BYTES_BY_LEVEL: Readonly<Record<QrErrorCorrectionLevel, number>> = {
  L: 2953,
  M: 2331,
};

export interface QrMatrixResult {
  version: number;
  size: number;
  ecLevel: QrErrorCorrectionLevel;
  /** Row-major module buffer of length `size * size` (`1` = dark, `0` = light). */
  modules: Uint8Array;
}

export interface QrSvgOptions {
  quietZone?: number;
  fgColor?: string;
  bgColor?: string;
}

export interface QrReedSolomonBlock {
  data: Uint8Array;
  ec: Uint8Array;
  codewords: Uint8Array;
}

export interface QrEncodedCodewords {
  version: number;
  ecLevel: QrErrorCorrectionLevel;
  ecCodewordsPerBlock: number;
  dataCodewords: Uint8Array;
  blocks: QrReedSolomonBlock[];
  interleavedCodewords: Uint8Array;
}

interface EccSpec {
  ecPerBlock: number;
  totalBlocks: number;
}

/**
 * ISO/IEC 18004 Table 9 EC parameters `[ecCodewordsPerBlock, totalBlocks]`
 * indexed by 1-based version `1..40` (index `0` unused).
 */
const ECC_TABLE: Readonly<Record<QrErrorCorrectionLevel, ReadonlyArray<EccSpec | null>>> = {
  L: [
    null,
    { ecPerBlock: 7, totalBlocks: 1 },
    { ecPerBlock: 10, totalBlocks: 1 },
    { ecPerBlock: 15, totalBlocks: 1 },
    { ecPerBlock: 20, totalBlocks: 1 },
    { ecPerBlock: 26, totalBlocks: 1 },
    { ecPerBlock: 18, totalBlocks: 2 },
    { ecPerBlock: 20, totalBlocks: 2 },
    { ecPerBlock: 24, totalBlocks: 2 },
    { ecPerBlock: 30, totalBlocks: 2 },
    { ecPerBlock: 18, totalBlocks: 4 },
    { ecPerBlock: 20, totalBlocks: 4 },
    { ecPerBlock: 24, totalBlocks: 4 },
    { ecPerBlock: 26, totalBlocks: 4 },
    { ecPerBlock: 30, totalBlocks: 4 },
    { ecPerBlock: 22, totalBlocks: 6 },
    { ecPerBlock: 24, totalBlocks: 6 },
    { ecPerBlock: 28, totalBlocks: 6 },
    { ecPerBlock: 30, totalBlocks: 6 },
    { ecPerBlock: 28, totalBlocks: 7 },
    { ecPerBlock: 28, totalBlocks: 8 },
    { ecPerBlock: 28, totalBlocks: 8 },
    { ecPerBlock: 28, totalBlocks: 9 },
    { ecPerBlock: 30, totalBlocks: 9 },
    { ecPerBlock: 30, totalBlocks: 10 },
    { ecPerBlock: 26, totalBlocks: 12 },
    { ecPerBlock: 28, totalBlocks: 12 },
    { ecPerBlock: 30, totalBlocks: 12 },
    { ecPerBlock: 30, totalBlocks: 13 },
    { ecPerBlock: 30, totalBlocks: 14 },
    { ecPerBlock: 30, totalBlocks: 15 },
    { ecPerBlock: 30, totalBlocks: 16 },
    { ecPerBlock: 30, totalBlocks: 17 },
    { ecPerBlock: 30, totalBlocks: 18 },
    { ecPerBlock: 30, totalBlocks: 19 },
    { ecPerBlock: 30, totalBlocks: 19 },
    { ecPerBlock: 30, totalBlocks: 20 },
    { ecPerBlock: 30, totalBlocks: 21 },
    { ecPerBlock: 30, totalBlocks: 22 },
    { ecPerBlock: 30, totalBlocks: 24 },
    { ecPerBlock: 30, totalBlocks: 25 },
  ],
  M: [
    null,
    { ecPerBlock: 10, totalBlocks: 1 },
    { ecPerBlock: 16, totalBlocks: 1 },
    { ecPerBlock: 26, totalBlocks: 1 },
    { ecPerBlock: 18, totalBlocks: 2 },
    { ecPerBlock: 24, totalBlocks: 2 },
    { ecPerBlock: 16, totalBlocks: 4 },
    { ecPerBlock: 18, totalBlocks: 4 },
    { ecPerBlock: 22, totalBlocks: 4 },
    { ecPerBlock: 22, totalBlocks: 5 },
    { ecPerBlock: 26, totalBlocks: 5 },
    { ecPerBlock: 30, totalBlocks: 5 },
    { ecPerBlock: 22, totalBlocks: 8 },
    { ecPerBlock: 22, totalBlocks: 9 },
    { ecPerBlock: 24, totalBlocks: 9 },
    { ecPerBlock: 24, totalBlocks: 10 },
    { ecPerBlock: 28, totalBlocks: 10 },
    { ecPerBlock: 28, totalBlocks: 11 },
    { ecPerBlock: 26, totalBlocks: 13 },
    { ecPerBlock: 26, totalBlocks: 14 },
    { ecPerBlock: 26, totalBlocks: 16 },
    { ecPerBlock: 26, totalBlocks: 17 },
    { ecPerBlock: 28, totalBlocks: 17 },
    { ecPerBlock: 28, totalBlocks: 18 },
    { ecPerBlock: 28, totalBlocks: 20 },
    { ecPerBlock: 28, totalBlocks: 21 },
    { ecPerBlock: 28, totalBlocks: 23 },
    { ecPerBlock: 28, totalBlocks: 25 },
    { ecPerBlock: 28, totalBlocks: 26 },
    { ecPerBlock: 28, totalBlocks: 28 },
    { ecPerBlock: 28, totalBlocks: 29 },
    { ecPerBlock: 28, totalBlocks: 31 },
    { ecPerBlock: 28, totalBlocks: 33 },
    { ecPerBlock: 28, totalBlocks: 35 },
    { ecPerBlock: 28, totalBlocks: 37 },
    { ecPerBlock: 28, totalBlocks: 38 },
    { ecPerBlock: 28, totalBlocks: 40 },
    { ecPerBlock: 28, totalBlocks: 43 },
    { ecPerBlock: 28, totalBlocks: 45 },
    { ecPerBlock: 28, totalBlocks: 47 },
    { ecPerBlock: 28, totalBlocks: 49 },
  ],
};

// GF(256) lookup tables modulo primitive polynomial 0x11D (x^8 + x^4 + x^3 + x^2 + 1)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let value = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if ((value & 0x100) !== 0) {
      value ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

const RS_GENERATOR_CACHE = new Map<number, Uint8Array>();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function getReedSolomonGenerator(degree: number): Uint8Array {
  const cached = RS_GENERATOR_CACHE.get(degree);
  if (cached) return cached;

  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = GF_EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      const coeff = poly[j]!;
      next[j] = (next[j]! ^ coeff) & 0xff;
      next[j + 1] = (next[j + 1]! ^ gfMul(coeff, root)) & 0xff;
    }
    poly = next;
  }

  RS_GENERATOR_CACHE.set(degree, poly);
  return poly;
}

function computeReedSolomonEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getReedSolomonGenerator(ecCount);
  const rem = new Uint8Array(ecCount);

  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ rem[0]!;
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] = (rem[j]! ^ gfMul(gen[j + 1]!, factor)) & 0xff;
      }
    }
  }

  return rem;
}

/**
 * Evaluates the `ecCount` Reed-Solomon syndromes `C(alpha^0) .. C(alpha^(ecCount - 1))`
 * over GF(256) (`0x11D`) for a single codeword block `[...data, ...ec]`.
 * Every byte of the returned array is `0` for a valid codeword block.
 */
export function evaluateReedSolomonSyndromes(
  blockCodewords: Uint8Array,
  ecCount: number,
): Uint8Array {
  const syndromes = new Uint8Array(ecCount);
  for (let i = 0; i < ecCount; i++) {
    const root = GF_EXP[i]!;
    let acc = 0;
    for (let j = 0; j < blockCodewords.length; j++) {
      acc = gfMul(acc, root) ^ blockCodewords[j]!;
    }
    syndromes[i] = acc;
  }
  return syndromes;
}

function getTotalRawCodewords(version: number): number {
  const size = version * 4 + 17;
  let bits = size * size - 192 - 2 * (4 * version + 1) - 1 - 30 - (version >= 7 ? 36 : 0);
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    bits -= 25 * (numAlign * numAlign - 3) - (numAlign >= 3 ? 10 * (numAlign - 2) : 0);
  }
  return Math.floor(bits / 8);
}

/**
 * Returns the maximum number of UTF-8 bytes encodable in Byte mode (`0100`)
 * for a given QR version (`1..40`) and error-correction level (`'L' | 'M'`).
 */
export function getQrByteCapacity(version: number, ecLevel: QrErrorCorrectionLevel): number {
  const spec = ECC_TABLE[ecLevel][version];
  if (!spec) return 0;
  const totalCodewords = getTotalRawCodewords(version);
  const totalDataCodewords = totalCodewords - spec.ecPerBlock * spec.totalBlocks;
  const headerOverheadBytes = version <= 9 ? 2 : 3;
  return totalDataCodewords - headerOverheadBytes;
}

/**
 * Computes the 1D list of alignment pattern center coordinates (0-indexed)
 * for a QR version `1..40`. Version `1` has no alignment patterns (`[]`).
 */
export function getAlignmentPatternPositions(version: number): number[] {
  if (version < 2 || version > 40) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const positions = new Array<number>(numAlign);
  positions[0] = 6;
  for (let i = numAlign - 1, pos = version * 4 + 10; i >= 1; i--, pos -= step) {
    positions[i] = pos;
  }
  return positions;
}

function appendBits(targetBits: number[], value: number, bitLength: number): void {
  for (let i = bitLength - 1; i >= 0; i--) {
    targetBits.push((value >>> i) & 1);
  }
}

function buildByteModeDataCodewords(
  utf8Bytes: Uint8Array,
  version: number,
  totalDataCodewords: number,
): Uint8Array {
  const bits: number[] = [];
  const charCountBits = version <= 9 ? 8 : 16;

  // Mode 0100 (Byte) + character count indicator + UTF-8 payload
  appendBits(bits, 0b0100, 4);
  appendBits(bits, utf8Bytes.length, charCountBits);
  for (let i = 0; i < utf8Bytes.length; i++) {
    appendBits(bits, utf8Bytes[i]!, 8);
  }

  const maxDataBits = totalDataCodewords * 8;
  const terminatorLen = Math.min(4, maxDataBits - bits.length);
  for (let i = 0; i < terminatorLen; i++) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = new Uint8Array(totalDataCodewords);
  const encodedByteCount = bits.length >>> 3;
  for (let i = 0; i < encodedByteCount; i++) {
    let byte = 0;
    const base = i * 8;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[base + b]!;
    }
    dataCodewords[i] = byte;
  }

  // Pad remaining codewords with alternating 0xEC and 0x11
  for (let i = encodedByteCount; i < totalDataCodewords; i++) {
    dataCodewords[i] = (i - encodedByteCount) % 2 === 0 ? 0xec : 0x11;
  }

  return dataCodewords;
}

/**
 * Encodes UTF-8 text into padded ISO/IEC 18004 data codewords, Reed-Solomon ECC blocks,
 * and the final interleaved codeword stream (before matrix placement).
 * Returns `null` for empty text or payloads exceeding capacity.
 */
export function encodeDataToCodewords(
  text: string,
  ecLevel: QrErrorCorrectionLevel = 'L',
): QrEncodedCodewords | null {
  if (!text) return null;
  const utf8Bytes = new TextEncoder().encode(text);
  if (utf8Bytes.length === 0 || utf8Bytes.length > QR_MAX_BYTES_BY_LEVEL[ecLevel]) {
    return null;
  }

  let version = -1;
  for (let v = 1; v <= 40; v++) {
    if (utf8Bytes.length <= getQrByteCapacity(v, ecLevel)) {
      version = v;
      break;
    }
  }
  if (version === -1) return null;

  const spec = ECC_TABLE[ecLevel][version]!;
  const totalRawCodewords = getTotalRawCodewords(version);
  const totalDataCodewords = totalRawCodewords - spec.ecPerBlock * spec.totalBlocks;
  const dataCodewords = buildByteModeDataCodewords(utf8Bytes, version, totalDataCodewords);

  const shortBlockLen = Math.floor(totalDataCodewords / spec.totalBlocks);
  const numLongBlocks = totalDataCodewords % spec.totalBlocks;
  const numShortBlocks = spec.totalBlocks - numLongBlocks;

  const blocks: QrReedSolomonBlock[] = [];
  let offset = 0;
  for (let b = 0; b < spec.totalBlocks; b++) {
    const blockDataLen = b < numShortBlocks ? shortBlockLen : shortBlockLen + 1;
    const data = dataCodewords.slice(offset, offset + blockDataLen);
    offset += blockDataLen;
    const ec = computeReedSolomonEc(data, spec.ecPerBlock);
    const codewords = new Uint8Array(blockDataLen + spec.ecPerBlock);
    codewords.set(data, 0);
    codewords.set(ec, blockDataLen);
    blocks.push({ data, ec, codewords });
  }

  const interleaved = new Uint8Array(totalRawCodewords);
  let outPos = 0;
  const maxDataLen = shortBlockLen + (numLongBlocks > 0 ? 1 : 0);
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < blocks.length; b++) {
      const blockData = blocks[b]!.data;
      if (col < blockData.length) {
        interleaved[outPos++] = blockData[col]!;
      }
    }
  }
  for (let col = 0; col < spec.ecPerBlock; col++) {
    for (let b = 0; b < blocks.length; b++) {
      interleaved[outPos++] = blocks[b]!.ec[col]!;
    }
  }

  return {
    version,
    ecLevel,
    ecCodewordsPerBlock: spec.ecPerBlock,
    dataCodewords,
    blocks,
    interleavedCodewords: interleaved,
  };
}

function setFunctionModule(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  row: number,
  col: number,
  dark: number,
): void {
  const idx = row * size + col;
  modules[idx] = dark & 1;
  isFunction[idx] = 1;
}

function drawFinderAndSeparator(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  topRow: number,
  leftCol: number,
): void {
  for (let dr = -1; dr <= 7; dr++) {
    const r = topRow + dr;
    if (r < 0 || r >= size) continue;
    for (let dc = -1; dc <= 7; dc++) {
      const c = leftCol + dc;
      if (c < 0 || c >= size) continue;
      const inFinder = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const dark =
        inFinder && Math.max(Math.abs(dr - 3), Math.abs(dc - 3)) !== 2 ? 1 : 0;
      setFunctionModule(modules, isFunction, size, r, c, dark);
    }
  }
}

function drawAlignmentPattern(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  centerRow: number,
  centerCol: number,
): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
      setFunctionModule(modules, isFunction, size, centerRow + dr, centerCol + dc, dark);
    }
  }
}

function computeFormatBits(ecLevel: QrErrorCorrectionLevel, mask: number): number {
  const ecIndicator = ecLevel === 'L' ? 0b01 : 0b00;
  const data = (ecIndicator << 3) | (mask & 0x7);
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if (((rem >>> i) & 1) !== 0) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if (((rem >>> i) & 1) !== 0) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

function drawFormatBits(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  formatBits: number,
): void {
  // Copy 1: around top-left finder
  for (let i = 0; i <= 5; i++) {
    setFunctionModule(modules, isFunction, size, i, 8, (formatBits >>> i) & 1);
  }
  setFunctionModule(modules, isFunction, size, 7, 8, (formatBits >>> 6) & 1);
  setFunctionModule(modules, isFunction, size, 8, 8, (formatBits >>> 7) & 1);
  setFunctionModule(modules, isFunction, size, 8, 7, (formatBits >>> 8) & 1);
  for (let i = 9; i < 15; i++) {
    setFunctionModule(modules, isFunction, size, 8, 14 - i, (formatBits >>> i) & 1);
  }

  // Copy 2: split between top-right and bottom-left finders
  for (let i = 0; i < 8; i++) {
    setFunctionModule(modules, isFunction, size, 8, size - 1 - i, (formatBits >>> i) & 1);
  }
  for (let i = 8; i < 15; i++) {
    setFunctionModule(modules, isFunction, size, size - 15 + i, 8, (formatBits >>> i) & 1);
  }
}

function drawVersionBits(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  version: number,
): void {
  if (version < 7) return;
  const bits = computeVersionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = (bits >>> i) & 1;
    const major = Math.floor(i / 3);
    const minor = size - 11 + (i % 3);
    setFunctionModule(modules, isFunction, size, minor, major, bit);
    setFunctionModule(modules, isFunction, size, major, minor, bit);
  }
}

function drawFunctionPatterns(
  modules: Uint8Array,
  isFunction: Uint8Array,
  version: number,
  size: number,
): void {
  drawFinderAndSeparator(modules, isFunction, size, 0, 0);
  drawFinderAndSeparator(modules, isFunction, size, 0, size - 7);
  drawFinderAndSeparator(modules, isFunction, size, size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0 ? 1 : 0;
    setFunctionModule(modules, isFunction, size, 6, i, dark);
    setFunctionModule(modules, isFunction, size, i, 6, dark);
  }

  const alignPositions = getAlignmentPatternPositions(version);
  const lastIdx = alignPositions.length - 1;
  for (let i = 0; i < alignPositions.length; i++) {
    for (let j = 0; j < alignPositions.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === lastIdx) ||
        (i === lastIdx && j === 0)
      ) {
        continue;
      }
      drawAlignmentPattern(modules, isFunction, size, alignPositions[i]!, alignPositions[j]!);
    }
  }

  // Mandatory dark module at (4 * V + 9, 8)
  setFunctionModule(modules, isFunction, size, 4 * version + 9, 8, 1);

  // Reserve format info slots before placing codewords
  drawFormatBits(modules, isFunction, size, 0);
  drawVersionBits(modules, isFunction, size, version);
}

function drawInterleavedCodewords(
  modules: Uint8Array,
  isFunction: Uint8Array,
  size: number,
  codewords: Uint8Array,
): void {
  const totalBits = codewords.length * 8;
  let bitIndex = 0;
  let upward = true;

  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) {
      rightCol = 5;
    }
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const col = rightCol - offset;
        const idx = row * size + col;
        if (isFunction[idx] === 0) {
          let bit = 0;
          if (bitIndex < totalBits) {
            bit = (codewords[bitIndex >>> 3]! >>> (7 - (bitIndex & 7))) & 1;
            bitIndex += 1;
          }
          modules[idx] = bit;
        }
      }
    }
    upward = !upward;
  }
}

function isMaskModuleInverted(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return false;
  }
}

function matchesFinderPenaltyWindow(
  modules: Uint8Array,
  start: number,
  stride: number,
  leadingLight: boolean,
): boolean {
  const pattern = leadingLight
    ? [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1]
    : [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  for (let k = 0; k < 11; k++) {
    if (modules[start + k * stride] !== pattern[k]) {
      return false;
    }
  }
  return true;
}

function evaluateMaskPenalty(modules: Uint8Array, size: number): number {
  let penalty = 0;

  // Rule 1 (adjacent >= 5 modules of same color) + Rule 3 (1:1:3:1:1 finder-like sequence)
  for (let r = 0; r < size; r++) {
    const rowBase = r * size;
    let runColor = modules[rowBase]!;
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      const color = modules[rowBase + c]!;
      if (color === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = color;
        runLen = 1;
      }
    }
    for (let c = 0; c <= size - 11; c++) {
      const start = rowBase + c;
      if (matchesFinderPenaltyWindow(modules, start, 1, false)) penalty += 40;
      if (matchesFinderPenaltyWindow(modules, start, 1, true)) penalty += 40;
    }
  }

  for (let c = 0; c < size; c++) {
    let runColor = modules[c]!;
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      const color = modules[r * size + c]!;
      if (color === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = color;
        runLen = 1;
      }
    }
    for (let r = 0; r <= size - 11; r++) {
      const start = r * size + c;
      if (matchesFinderPenaltyWindow(modules, start, size, false)) penalty += 40;
      if (matchesFinderPenaltyWindow(modules, start, size, true)) penalty += 40;
    }
  }

  // Rule 2: 2x2 same-color blocks
  for (let r = 0; r < size - 1; r++) {
    const rowBase = r * size;
    const nextBase = (r + 1) * size;
    for (let c = 0; c < size - 1; c++) {
      const v = modules[rowBase + c]!;
      if (
        v === modules[rowBase + c + 1] &&
        v === modules[nextBase + c] &&
        v === modules[nextBase + c + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // Rule 4: dark module balance deviation from 50% in 5% steps
  let darkCount = 0;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    darkCount += modules[i]!;
  }
  penalty += Math.floor(Math.abs(darkCount * 20 - total * 10) / total) * 10;

  return penalty;
}

/**
 * Encodes UTF-8 `text` into an ISO/IEC 18004 Model 2 QR Code matrix in Byte mode (`0100`).
 * Supports error-correction levels `'L'` (up to 2,953 bytes) and `'M'` (up to 2,331 bytes).
 * Returns `null` when `text` is empty or exceeds capacity.
 */
export function encodeQrMatrix(
  text: string,
  ecLevel: QrErrorCorrectionLevel = 'L',
): QrMatrixResult | null {
  const encoded = encodeDataToCodewords(text, ecLevel);
  if (!encoded) return null;

  const { version, interleavedCodewords } = encoded;
  const size = version * 4 + 17;
  const baseModules = new Uint8Array(size * size);
  const isFunction = new Uint8Array(size * size);

  drawFunctionPatterns(baseModules, isFunction, version, size);
  drawInterleavedCodewords(baseModules, isFunction, size, interleavedCodewords);

  let bestPenalty = Number.POSITIVE_INFINITY;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.slice();
    for (let r = 0; r < size; r++) {
      const rowBase = r * size;
      for (let c = 0; c < size; c++) {
        const idx = rowBase + c;
        if (isFunction[idx] === 0 && isMaskModuleInverted(mask, r, c)) {
          candidate[idx] = (candidate[idx]! ^ 1) & 1;
        }
      }
    }
    drawFormatBits(candidate, isFunction, size, computeFormatBits(ecLevel, mask));
    const penalty = evaluateMaskPenalty(candidate, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestModules = candidate;
    }
  }

  return {
    version,
    size,
    ecLevel,
    modules: bestModules,
  };
}

function sanitizeSvgColor(rawColor: string | undefined, fallback: string): string {
  if (!rawColor) return fallback;
  const trimmed = rawColor.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed) || /^[a-zA-Z]{3,20}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

/**
 * Renders a `QrMatrixResult` into crisp vector SVG markup using a single combined `<path>`.
 */
export function renderQrSvgMarkup(matrix: QrMatrixResult, options?: QrSvgOptions): string {
  const quietZone = Math.max(0, Math.floor(options?.quietZone ?? 4));
  const fgColor = sanitizeSvgColor(options?.fgColor, '#000000');
  const bgColor = sanitizeSvgColor(options?.bgColor, '#ffffff');
  const totalSize = matrix.size + quietZone * 2;

  const pathParts: string[] = [];
  for (let r = 0; r < matrix.size; r++) {
    const rowBase = r * matrix.size;
    let c = 0;
    while (c < matrix.size) {
      if (matrix.modules[rowBase + c] === 1) {
        const startCol = c;
        while (c < matrix.size && matrix.modules[rowBase + c] === 1) {
          c += 1;
        }
        const runLen = c - startCol;
        pathParts.push(`M${startCol + quietZone},${r + quietZone}h${runLen}v1h-${runLen}z`);
      } else {
        c += 1;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" role="img" aria-label="QR Code v${matrix.version} ${matrix.size}x${matrix.size}">`,
    `<rect width="${totalSize}" height="${totalSize}" fill="${bgColor}"/>`,
    `<path d="${pathParts.join('')}" fill="${fgColor}"/>`,
    `</svg>`,
  ].join('');
}

/**
 * Encodes a `QrMatrixResult` as an UTF-8 SVG `data:image/svg+xml` URI ready for `<img src=...>`.
 */
export function renderQrSvgDataUri(matrix: QrMatrixResult, options?: QrSvgOptions): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderQrSvgMarkup(matrix, options))}`;
}
