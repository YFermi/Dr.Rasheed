// Verse references written in a text («[الأعراف: 80]», «(سورة هود: 78)»,
// «[الحجر: 73-74]», Arabic-Indic digits too): those of Dr. Rasheed's passages and
// the reference article may be cited by the generated article as well.

const REF_RE = /[[(]\s*(?:سورة\s+)?([ء-ي\s]{2,20}?)\s*[:：]\s*([0-9٠-٩]+)(?:\s*[-–—]\s*([0-9٠-٩]+))?\s*[\])]/g;
const western = (d: string) => d.replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x0660));

export function textVerseRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(REF_RE)) {
    const from = western(m[2]);
    const to = m[3] ? western(m[3]) : '';
    refs.add(`${m[1].trim()}:${from}${to && to !== from ? `-${to}` : ''}`);
  }
  return [...refs];
}

// The references of these texts that exist in the Quran text, with the surah's
// canonical name («الاعراف: 82» → «الأعراف:82»)
export async function quranRefsIn(texts: string[]): Promise<string[]> {
  const { resolveVerseRef, getSurahNumber, getSurahName } = await import('./quranLookup');
  const refs = new Set<string>();
  for (const ref of texts.flatMap(textVerseRefs)) {
    const resolved = resolveVerseRef(ref);
    if (!resolved) continue;
    const number = getSurahNumber(resolved.surah);
    const name = (number !== null && getSurahName(number)) || resolved.surah;
    refs.add(`${name}:${resolved.ayahFrom}${resolved.ayahTo && resolved.ayahTo !== resolved.ayahFrom ? `-${resolved.ayahTo}` : ''}`);
  }
  return [...refs];
}
