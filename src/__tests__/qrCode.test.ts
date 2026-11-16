import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TableQrModal } from '../components/TableQrModal.js';
import {
  encodeDataToCodewords,
  encodeQrMatrix,
  evaluateReedSolomonSyndromes,
  getAlignmentPatternPositions,
  getQrByteCapacity,
  QR_MAX_BYTES_BY_LEVEL,
  renderQrSvgDataUri,
  renderQrSvgMarkup,
  type QrErrorCorrectionLevel,
  type QrMatrixResult,
} from '../deck/qrCode.js';
import type { CompactCard } from '../types/card.js';
import type { DeckDraft } from '../types/deck.js';

function makeCommander(name = 'Veyran, Voice of Duality'): CompactCard {
  return {
    id: 'cmd-veyran',
    oracleId: 'oracle-veyran',
    name,
    manaCost: '{1}{U}{R}',
    cmc: 3,
    typeLine: 'Legendary Creature — Efreet Wizard',
    oracleText: '',
    colors: ['U', 'R'],
    colorIdentity: ['U', 'R'],
    keywords: [],
    edhrecRank: 40,
    priceUsd: 4.5,
    imageNormal: '',
    imageSmall: '',
    layout: 'normal',
    isCommanderEligible: true,
    roles: [],
    themes: ['spellslinger'],
  };
}

function makeDeck(overrides: Partial<DeckDraft> = {}): DeckDraft {
  return {
    id: 'deck-qr-1',
    name: 'Izzet Spellslinger',
    commanders: [makeCommander()],
    mainboard: {},
    sideboard: {},
    lockSearchToCommanderIdentity: true,
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

function buildFunctionMaskForVerification(version: number, size: number): Uint8Array {
  const fn = new Uint8Array(size * size);
  const markFinder = (tr: number, lc: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      const r = tr + dr;
      if (r < 0 || r >= size) continue;
      for (let dc = -1; dc <= 7; dc++) {
        const c = lc + dc;
        if (c < 0 || c >= size) continue;
        fn[r * size + c] = 1;
      }
    }
  };
  markFinder(0, 0);
  markFinder(0, size - 7);
  markFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    fn[6 * size + i] = 1;
    fn[i * size + 6] = 1;
  }

  const align = getAlignmentPatternPositions(version);
  const last = align.length - 1;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
        continue;
      }
      const cy = align[i]!;
      const cx = align[j]!;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          fn[(cy + dr) * size + (cx + dc)] = 1;
        }
      }
    }
  }

  fn[(4 * version + 9) * size + 8] = 1;

  for (let i = 0; i <= 5; i++) fn[i * size + 8] = 1;
  fn[7 * size + 8] = 1;
  fn[8 * size + 8] = 1;
  fn[8 * size + 7] = 1;
  for (let i = 9; i < 15; i++) fn[8 * size + (14 - i)] = 1;
  for (let i = 0; i < 8; i++) fn[8 * size + (size - 1 - i)] = 1;
  for (let i = 8; i < 15; i++) fn[(size - 15 + i) * size + 8] = 1;

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const major = Math.floor(i / 3);
      const minor = size - 11 + (i % 3);
      fn[minor * size + major] = 1;
      fn[major * size + minor] = 1;
    }
  }
  return fn;
}

function maskBit(mask: number, row: number, col: number): number {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0 ? 1 : 0;
    case 1:
      return row % 2 === 0 ? 1 : 0;
    case 2:
      return col % 3 === 0 ? 1 : 0;
    case 3:
      return (row + col) % 3 === 0 ? 1 : 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0 ? 1 : 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0 ? 1 : 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0 ? 1 : 0;
    case 7:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0 ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Independent QR symbol reader used in tests to prove rendered matrices decode back
 * cleanly into valid BCH format info, Golay version info, zero-syndrome RS blocks,
 * and exact UTF-8 byte payloads.
 */
function verifyAndDecodeQrMatrix(matrix: QrMatrixResult): {
  decodedText: string;
  mask: number;
  ecLevel: QrErrorCorrectionLevel;
  blockSyndromesAllZero: boolean;
} {
  const { version, size, modules } = matrix;
  const at = (r: number, c: number) => modules[r * size + c]!;

  // Read Format Copy 1 and Copy 2
  let fmt1 = 0;
  for (let i = 0; i <= 5; i++) fmt1 |= at(i, 8) << i;
  fmt1 |= at(7, 8) << 6;
  fmt1 |= at(8, 8) << 7;
  fmt1 |= at(8, 7) << 8;
  for (let i = 9; i < 15; i++) fmt1 |= at(8, 14 - i) << i;

  let fmt2 = 0;
  for (let i = 0; i < 8; i++) fmt2 |= at(8, size - 1 - i) << i;
  for (let i = 8; i < 15; i++) fmt2 |= at(size - 15 + i, 8) << i;

  expect(fmt1).toBe(fmt2);
  const unmaskedFmt = fmt1 ^ 0x5412;
  let fmtRem = unmaskedFmt;
  for (let i = 14; i >= 10; i--) {
    if ((fmtRem >>> i) & 1) fmtRem ^= 0x537 << (i - 10);
  }
  expect(fmtRem).toBe(0);

  const ecBits = (unmaskedFmt >>> 13) & 0x3;
  const ecLevel: QrErrorCorrectionLevel = ecBits === 0b01 ? 'L' : 'M';
  expect(ecLevel).toBe(matrix.ecLevel);
  const mask = (unmaskedFmt >>> 10) & 0x7;

  // Read Version Info for V >= 7
  if (version >= 7) {
    let v1 = 0;
    let v2 = 0;
    for (let i = 0; i < 18; i++) {
      const major = Math.floor(i / 3);
      const minor = size - 11 + (i % 3);
      v1 |= at(minor, major) << i;
      v2 |= at(major, minor) << i;
    }
    expect(v1).toBe(v2);
    expect(v1 >>> 12).toBe(version);
    let vRem = v1;
    for (let i = 17; i >= 12; i--) {
      if ((vRem >>> i) & 1) vRem ^= 0x1f25 << (i - 12);
    }
    expect(vRem).toBe(0);
  }

  // Read unmasked zigzag bitstream
  const fn = buildFunctionMaskForVerification(version, size);
  const rawBits: number[] = [];
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let off = 0; off < 2; off++) {
        const c = rightCol - off;
        if (fn[r * size + c] === 0) {
          rawBits.push(at(r, c) ^ maskBit(mask, r, c));
        }
      }
    }
    upward = !upward;
  }

  const totalCodewords = Math.floor(rawBits.length / 8);
  const codewords = new Uint8Array(totalCodewords);
  for (let i = 0; i < totalCodewords; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | rawBits[i * 8 + b]!;
    }
    codewords[i] = byte;
  }

  // Cross-check reconstructed interleaved stream against reference encoder structure
  const ref = encodeDataToCodewords(
    'x'.repeat(Math.max(1, getQrByteCapacity(version, ecLevel))),
    ecLevel,
  )!;
  expect(ref.version).toBe(version);
  expect(codewords.length).toBe(ref.interleavedCodewords.length);

  const numBlocks = ref.blocks.length;
  const ecPerBlock = ref.ecCodewordsPerBlock;
  const reconstructedBlocks = ref.blocks.map(
    (b) => new Uint8Array(b.data.length + ecPerBlock),
  );

  let pos = 0;
  const maxDataLen = Math.max(...ref.blocks.map((b) => b.data.length));
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < numBlocks; b++) {
      if (col < ref.blocks[b]!.data.length) {
        reconstructedBlocks[b]![col] = codewords[pos++]!;
      }
    }
  }
  for (let col = 0; col < ecPerBlock; col++) {
    for (let b = 0; b < numBlocks; b++) {
      reconstructedBlocks[b]![ref.blocks[b]!.data.length + col] = codewords[pos++]!;
    }
  }

  let blockSyndromesAllZero = true;
  for (const blk of reconstructedBlocks) {
    const syn = evaluateReedSolomonSyndromes(blk, ecPerBlock);
    if (syn.some((s) => s !== 0)) {
      blockSyndromesAllZero = false;
    }
  }

  // Reassemble data bits and decode Byte mode (0100)
  const dataBytes: number[] = [];
  for (let b = 0; b < numBlocks; b++) {
    const dataLen = ref.blocks[b]!.data.length;
    for (let i = 0; i < dataLen; i++) {
      dataBytes.push(reconstructedBlocks[b]![i]!);
    }
  }
  const dataBits: number[] = [];
  for (const byte of dataBytes) {
    for (let bit = 7; bit >= 0; bit--) {
      dataBits.push((byte >>> bit) & 1);
    }
  }

  const readBits = (start: number, len: number): number => {
    let val = 0;
    for (let i = 0; i < len; i++) val = (val << 1) | dataBits[start + i]!;
    return val;
  };

  const mode = readBits(0, 4);
  expect(mode).toBe(0b0100);
  const countBits = version <= 9 ? 8 : 16;
  const byteLen = readBits(4, countBits);
  const payload = new Uint8Array(byteLen);
  let bitCursor = 4 + countBits;
  for (let i = 0; i < byteLen; i++) {
    payload[i] = readBits(bitCursor, 8);
    bitCursor += 8;
  }

  return {
    decodedText: new TextDecoder().decode(payload),
    mask,
    ecLevel,
    blockSyndromesAllZero,
  };
}

describe('qrCode pure ISO/IEC 18004 generator', () => {
  it('enforces GF(256) Reed-Solomon syndromes === 0 across Versions 1, 3, 7, 15, 25, 40 for both L and M', () => {
    const targetVersions = [1, 3, 7, 15, 25, 40];
    const levels: QrErrorCorrectionLevel[] = ['L', 'M'];

    for (const ecLevel of levels) {
      for (const version of targetVersions) {
        const cap = getQrByteCapacity(version, ecLevel);
        const payload = `V${version}-${ecLevel}:`.padEnd(cap, 'R99');
        const encoded = encodeDataToCodewords(payload, ecLevel);
        expect(encoded).not.toBeNull();
        expect(encoded!.version).toBe(version);

        for (const block of encoded!.blocks) {
          const syndromes = evaluateReedSolomonSyndromes(
            block.codewords,
            encoded!.ecCodewordsPerBlock,
          );
          expect(Array.from(syndromes).every((s) => s === 0)).toBe(true);

          // Flipping one byte must produce non-zero syndromes
          const corrupted = block.codewords.slice();
          corrupted[0] = (corrupted[0]! ^ 0x01) & 0xff;
          const badSyndromes = evaluateReedSolomonSyndromes(
            corrupted,
            encoded!.ecCodewordsPerBlock,
          );
          expect(badSyndromes.some((s) => s !== 0)).toBe(true);
        }
      }
    }
  });

  it('produces zero-syndrome RS blocks and exact round-trip matrix decoding across all 40 versions (L & M)', () => {
    for (const ecLevel of ['L', 'M'] as const) {
      for (let version = 1; version <= 40; version++) {
        const cap = getQrByteCapacity(version, ecLevel);
        const payload = `${version}-${ecLevel}:${'A'.repeat(Math.max(1, cap - 5))}`.slice(0, cap);
        const matrix = encodeQrMatrix(payload, ecLevel);
        expect(matrix).not.toBeNull();
        expect(matrix!.version).toBe(version);
        expect(matrix!.size).toBe(4 * version + 17);
        expect(matrix!.modules.length).toBe(matrix!.size * matrix!.size);

        const decoded = verifyAndDecodeQrMatrix(matrix!);
        expect(decoded.blockSyndromesAllZero).toBe(true);
        expect(decoded.decodedText).toBe(payload);
      }
    }
  });

  it('places finder patterns, separators, timing strips, dark module (4*V+9, 8), and alignment centers accurately', () => {
    for (const version of [1, 2, 7, 15, 40]) {
      const cap = getQrByteCapacity(version, 'L');
      const payload = `struct-${version}`.padEnd(Math.min(cap, Math.max(1, cap - 1)), 'x');
      const matrix = encodeQrMatrix(payload, 'L')!;
      const { size, modules } = matrix;
      const at = (r: number, c: number) => modules[r * size + c];

      // 3 finder patterns + 1-module white separators
      const checkFinder = (tr: number, lc: number) => {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 7; c++) {
            const expected = Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2 ? 1 : 0;
            expect(at(tr + r, lc + c)).toBe(expected);
          }
        }
      };
      checkFinder(0, 0);
      checkFinder(0, size - 7);
      checkFinder(size - 7, 0);

      for (let i = 0; i < 8; i++) {
        expect(at(7, i)).toBe(0);
        expect(at(i, 7)).toBe(0);
        expect(at(7, size - 8 + i)).toBe(0);
        expect(at(i, size - 8)).toBe(0);
        expect(at(size - 8, i)).toBe(0);
        expect(at(size - 8 + i, 7)).toBe(0);
      }

      // Timing strips
      for (let i = 8; i < size - 8; i++) {
        const expected = i % 2 === 0 ? 1 : 0;
        expect(at(6, i)).toBe(expected);
        expect(at(i, 6)).toBe(expected);
      }

      // Mandatory dark module (4*V + 9, 8)
      expect(at(4 * version + 9, 8)).toBe(1);

      // Alignment patterns
      const align = getAlignmentPatternPositions(version);
      if (version === 1) {
        expect(align).toEqual([]);
      } else {
        const last = align.length - 1;
        for (let i = 0; i < align.length; i++) {
          for (let j = 0; j < align.length; j++) {
            if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) {
              continue;
            }
            const cy = align[i]!;
            const cx = align[j]!;
            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                const expected = Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0;
                expect(at(cy + dr, cx + dc)).toBe(expected);
              }
            }
          }
        }
      }
    }
  });

  it('handles UTF-8 multibyte text, 0xEC/0x11 padding, and exact max-byte boundaries', () => {
    const utf8Input = 'Café Brûlée — Ripple99 🚀🔥';
    const utf8Matrix = encodeQrMatrix(utf8Input, 'M')!;
    const decoded = verifyAndDecodeQrMatrix(utf8Matrix);
    expect(decoded.decodedText).toBe(utf8Input);

    // Verify 0xEC / 0x11 alternating pad codewords on short V1-L input
    const shortEncoded = encodeDataToCodewords('AB', 'L')!;
    // Mode (4 bits) + len (8 bits) + 2 bytes + 4-bit terminator = 4 bytes before pad
    expect(shortEncoded.dataCodewords[4]).toBe(0xec);
    expect(shortEncoded.dataCodewords[5]).toBe(0x11);
    expect(shortEncoded.dataCodewords[6]).toBe(0xec);
    expect(shortEncoded.dataCodewords[7]).toBe(0x11);

    // Empty and over-capacity boundaries
    expect(encodeQrMatrix('')).toBeNull();
    expect(QR_MAX_BYTES_BY_LEVEL).toEqual({ L: 2953, M: 2331 });

    // Evaluates all 8 masks and selects different optimal masks across varied inputs
    const selectedMasks = new Set<number>();
    for (const sample of [
      'https://ripple99.pages.dev/?deck=1',
      'https://ripple99.pages.dev/?deck=2',
      'https://ripple99.pages.dev/?deck=alpha-beta',
      'https://ripple99.pages.dev/?deck=commander-99',
      '0000000000000000',
      '1111111111111111',
      'ZZZZZZZZZZZZZZZZ',
    ]) {
      const m = encodeQrMatrix(sample, 'M')!;
      selectedMasks.add(verifyAndDecodeQrMatrix(m).mask);
    }
    expect(selectedMasks.size).toBeGreaterThan(1);

    const maxL = 'a'.repeat(2953);
    const overL = 'a'.repeat(2954);
    expect(encodeQrMatrix(maxL, 'L')?.version).toBe(40);
    expect(encodeQrMatrix(overL, 'L')).toBeNull();

    const maxM = 'b'.repeat(2331);
    const overM = 'b'.repeat(2332);
    expect(encodeQrMatrix(maxM, 'M')?.version).toBe(40);
    expect(encodeQrMatrix(overM, 'M')).toBeNull();

    // Multibyte UTF-8 exceeding 2953 bytes even when string.length < 2953
    const multibyteOver = '🚀'.repeat(739); // 739 * 4 = 2956 UTF-8 bytes
    expect(multibyteOver.length).toBeLessThan(2953);
    expect(encodeQrMatrix(multibyteOver, 'L')).toBeNull();
  });

  it('renders crisp SVG markup and data URIs with quietZone padding', () => {
    const matrix = encodeQrMatrix('https://ripple99.pages.dev/?deck=abc', 'M')!;
    const svg = renderQrSvgMarkup(matrix, { quietZone: 4, fgColor: '#111827', bgColor: '#ffffff' });
    const expectedTotal = matrix.size + 8;

    expect(svg).toContain(`viewBox="0 0 ${expectedTotal} ${expectedTotal}"`);
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#111827"');
    expect(svg).toContain('<path d="M');

    const dataUri = renderQrSvgDataUri(matrix, { quietZone: 4 });
    expect(dataUri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(dataUri.replace('data:image/svg+xml;charset=utf-8,', ''))).toContain(
      '<svg',
    );
  });

  it('renders TableQrModal across closed, Public, Unlisted Link, and inactive visibility states', () => {
    const publicDeck: DeckDraft = { ...makeDeck(), visibility: 'public' };
    const unlistedDeck: DeckDraft = { ...makeDeck(), visibility: 'link' };
    const privateDeck: DeckDraft = { ...makeDeck(), visibility: 'private' };

    const closedHtml = renderToStaticMarkup(
      createElement(TableQrModal, {
        open: false,
        deck: publicDeck,
        cloudShareUrl: 'https://ripple99.pages.dev/?deck=abc',
        cloudShareActive: true,
        onClose: () => {},
      }),
    );
    expect(closedHtml).toBe('');

    const publicHtml = renderToStaticMarkup(
      createElement(TableQrModal, {
        open: true,
        deck: publicDeck,
        cloudShareUrl: 'https://ripple99.pages.dev/?deck=abc',
        cloudShareActive: true,
        onClose: () => {},
      }),
    );
    expect(publicHtml).toContain('Table QR Share');
    expect(publicHtml).toContain('Public');
    expect(publicHtml).toContain('Izzet Spellslinger');
    expect(publicHtml).toContain('v3 · 29×29');
    expect(publicHtml).toContain('EC-M');
    expect(publicHtml).toContain('data:image/svg+xml;charset=utf-8,');
    expect(publicHtml).toContain('https://ripple99.pages.dev/?deck=abc');
    expect(publicHtml).not.toContain('Offline Full-Deck QR');

    const unlistedHtml = renderToStaticMarkup(
      createElement(TableQrModal, {
        open: true,
        deck: unlistedDeck,
        cloudShareUrl: 'https://ripple99.pages.dev/?deck=unlisted-123',
        cloudShareActive: true,
        onClose: () => {},
      }),
    );
    expect(unlistedHtml).toContain('Unlisted Link');
    expect(unlistedHtml).toContain('https://ripple99.pages.dev/?deck=unlisted-123');
    expect(unlistedHtml).toContain('data:image/svg+xml;charset=utf-8,');

    const inactiveHtml = renderToStaticMarkup(
      createElement(TableQrModal, {
        open: true,
        deck: privateDeck,
        cloudShareUrl: null,
        cloudShareActive: false,
        onClose: () => {},
        onOpenShareSettings: () => {},
      }),
    );
    expect(inactiveHtml).toContain('Enable Public or Unlisted Link Visibility');
    expect(inactiveHtml).toContain('Open Share Settings');
    expect(inactiveHtml).not.toContain('data:image/svg+xml');
    expect(inactiveHtml).not.toContain('Offline Full-Deck QR');
  });
});
