// Reads a Word (.docx) file in the browser and returns its plain text.
// mammoth's package.json maps its Node-only modules (zip, file access) to
// browser versions, so it runs client-side with no server call; it is loaded
// on demand to keep it out of the main bundle.

import { countGlyphChars } from './arabic';

const MAX_FILE_BYTES = 15 * 1024 * 1024;

export interface WordReadResult {
  text: string;
  // Verse characters typed in a Quran font: they read as symbols in plain text
  quranGlyphChars: number;
}

export class WordReadError extends Error {}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

export async function readWordFile(file: File): Promise<WordReadResult> {
  if (!/\.docx$/i.test(file.name)) {
    throw new WordReadError('الملف ليس بصيغة Word (.docx). احفظه بصيغة .docx ثم أعد المحاولة.');
  }
  if (file.size === 0) throw new WordReadError('الملف فارغ.');
  if (file.size > MAX_FILE_BYTES) throw new WordReadError('الملف أكبر من ١٥ ميغابايت.');

  const arrayBuffer = await file.arrayBuffer();
  const head = new Uint8Array(arrayBuffer, 0, Math.min(8, arrayBuffer.byteLength));
  // .docx is a zip ("PK"); the old binary .doc starts with D0 CF 11 E0
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new WordReadError('هذا ملف Word قديم (.doc). افتحه في Word واحفظه بصيغة .docx.');
  }
  if (!startsWith(head, [0x50, 0x4b])) {
    throw new WordReadError('تعذرت قراءة الملف: ليس ملف Word صالحاً أو أنه تالف.');
  }

  let raw: string;
  try {
    const mammoth = await import('mammoth');
    const result = await (mammoth.default ?? mammoth).extractRawText({ arrayBuffer });
    raw = result.value;
  } catch (e) {
    console.warn('mammoth failed:', e);
    throw new WordReadError('تعذرت قراءة الملف: قد يكون تالفاً أو محمياً بكلمة مرور.');
  }

  // mammoth separates paragraphs with a blank line
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new WordReadError('لم يُعثر على نص في الملف.');
  return { text, quranGlyphChars: countGlyphChars(text) };
}
