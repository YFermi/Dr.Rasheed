import uthmaniData from '../../data/quran/quran-uthmani.json';
import simpleCleanData from '../../data/quran/quran-simple-clean.json';
import { normalizeArabic } from './arabic';

// Canonical Quran text from the Tanzil Project (tanzil.net, CC BY 3.0):
//   'uthmani'      — Uthmani Minimal, for display
//   'simple-clean' — standard spelling without diacritics, for search
// Used by scripts/build-blog.ts. Both files total ~2 MB, so browser code should
// load this module lazily (dynamic import) rather than bundle it.

export type QuranEdition = 'uthmani' | 'simple-clean';

interface SurahData {
  name: string;
  verses: Record<string, string>;
}

type QuranData = Record<string, SurahData | string[]>;

const EDITIONS: Record<QuranEdition, QuranData> = {
  uthmani: uthmaniData as QuranData,
  'simple-clean': simpleCleanData as QuranData,
};

export const QURAN_TEXT_ATTRIBUTION = 'Tanzil Project — tanzil.net (Quran text: Uthmani Minimal v1.1, CC BY 3.0)';

// Other names a surah is commonly cited by → surah number
const SURAH_ALIASES: Record<string, number> = {
  'براءة': 9,
  'بني إسرائيل': 17,
  'المؤمن': 40,
  'حم السجدة': 41,
  'السجدة حم': 41,
  'القتال': 47,
  'تبارك': 67,
  'الدهر': 76,
  'هل أتى': 76,
  'عم': 78,
  'عم يتساءلون': 78,
  'الانشراح': 94,
  'ألم نشرح': 94,
  'الزلزال': 99,
  'اللهب': 111,
  'تبت': 111,
  'التوحيد': 112,
};

// "سورة آلِ عمران" / "ال عمران" / "آل-عمران" → "العمران"
function surahKey(name: string): string {
  return normalizeArabic(name)
    .replace(/^سوره?ة?\s+/, '')
    .replace(/ة/g, 'ه')
    .replace(/[\s\-ـ]+/g, '');
}

const withoutArticle = (key: string) => (key.startsWith('ال') && key.length > 4 ? key.slice(2) : key);

let nameIndex: Map<string, number> | null = null;

// Built on first use: each surah's key, its key without "ال" (when unambiguous)
// and the aliases above.
function getNameIndex(): Map<string, number> {
  if (nameIndex) return nameIndex;
  const index = new Map<string, number>();
  const bare = new Map<string, number[]>();

  for (const [num, surah] of Object.entries(EDITIONS.uthmani)) {
    if (num.startsWith('_')) continue;
    const key = surahKey((surah as SurahData).name);
    index.set(key, Number(num));
    const short = withoutArticle(key);
    if (short !== key) bare.set(short, [...(bare.get(short) ?? []), Number(num)]);
  }
  for (const [short, nums] of bare) {
    if (nums.length === 1 && !index.has(short)) index.set(short, nums[0]);
  }
  for (const [alias, num] of Object.entries(SURAH_ALIASES)) {
    index.set(surahKey(alias), num);
  }

  nameIndex = index;
  return index;
}

export function getSurahNumber(name: string): number | null {
  const index = getNameIndex();
  const key = surahKey(name);
  return index.get(key) ?? index.get(withoutArticle(key)) ?? null;
}

export function getSurahName(surahNumber: number): string | null {
  const surah = EDITIONS.uthmani[String(surahNumber)] as SurahData | undefined;
  return surah?.name ?? null;
}

/**
 * Canonical text of a verse or verse range, joined with spaces.
 * Returns null for an unknown surah name or an ayah outside the surah.
 */
export function getVerseText(
  surah: string,
  ayahFrom: number,
  ayahTo?: number,
  edition: QuranEdition = 'uthmani'
): string | null {
  const surahNumber = getSurahNumber(surah);
  if (surahNumber === null) return null;
  const surahData = EDITIONS[edition][String(surahNumber)] as SurahData;

  const end = ayahTo ?? ayahFrom;
  if (end < ayahFrom) return null;
  const verses: string[] = [];
  for (let i = ayahFrom; i <= end; i++) {
    const text = surahData.verses[String(i)];
    if (!text) return null;
    verses.push(text);
  }
  return verses.join(' ');
}

/**
 * Resolve a verse reference key like "الحجر:76" or "الأعراف:80-84".
 */
export function resolveVerseRef(ref: string, edition: QuranEdition = 'uthmani'): {
  surah: string;
  ayahFrom: number;
  ayahTo?: number;
  text: string;
} | null {
  const match = normalizeArabic(ref).match(/^(.+?)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;

  const [, , from, to] = match;
  const surahName = ref.slice(0, ref.indexOf(':')).trim();
  const ayahFrom = Number(from);
  const ayahTo = to ? Number(to) : undefined;
  const text = getVerseText(surahName, ayahFrom, ayahTo, edition);
  if (!text) return null;

  return { surah: surahName, ayahFrom, ayahTo, text };
}
