// npm test — node:test through tsx (no test framework dependency)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOSING_LINE,
  dedupeParagraphs,
  dedupeVersesPerAxis,
  dropEchoedHeadings,
  fixClosings,
  fixTypos,
  mergeAdjacentVerses,
  protectVerses,
  restoreVerses,
  sanitizeArticle,
  sanitizeArticleBlocks,
  sanitizeProse,
  stripHeritageSentences,
} from '../articleSanitizer';
import { isAllowedRef } from '../../api/_lib/gemini';

// Uthmani text with dagger alif (ٰ) and tatweel (ـ): must survive byte for byte
const UTHMANI = '﴿فِيهِ ءَايَـٰتٌۢ بَيِّنَـٰتٌ مَّقَامُ إِبْرَٰهِيمَ﴾ [آل عمران: 97]';

test('1. protectVerses + restoreVerses round-trip, marks and dagger alif included', () => {
  const text = `فقرة أولى.\n\n${UTHMANI}\n\nفقرة ثانية ﴿قَالَ يَـٰقَوْمِ﴾ [هود: 78] هنا.`;
  const { masked, verses } = protectVerses(text);
  assert.equal(verses.length, 2);
  assert.ok(!masked.includes('﴿'));
  assert.equal(restoreVerses(masked, verses), text);
});

test('2. fixTypos never touches a verse (through sanitizeArticle)', () => {
  const raw = `المحور الأول: الآيات\n\nقرأنا الاية وفيها ءايـات بکلمة فارسیة.\n\n${UTHMANI}\n\nالنتيجة: الآيات بينات.`;
  const out = sanitizeArticle(raw);
  assert.ok(out.includes(UTHMANI), 'the verse is unchanged');
  assert.ok(out.includes('قرأنا الآية وفيها ءايات بكلمة فارسية.'), 'typos, tatweel and Persian letters fixed outside the verse');
});

test('fixTypos matches whole Arabic words (no \\b) and keeps paragraph breaks', () => {
  assert.equal(fixTypos('في الاية الكريمة'), 'في الآية الكريمة');
  assert.equal(fixTypos('الايات'), 'الايات', 'a longer word is not touched');
  assert.equal(fixTypos('فقرة أولى.\n\nفقرة   ثانية.'), 'فقرة أولى.\n\nفقرة ثانية.');
});

test('3. dedupeParagraphs drops a repeated paragraph and keeps one', () => {
  const p = 'نحن نرى والله أعلم أن الطهارة في هذا السياق كونية لا جسدية ولا شكلية.';
  const out = dedupeParagraphs(`${p}\n\nفقرة أخرى مختلفة تماماً عن الأولى في معناها ولفظها.\n\n${p}`);
  assert.equal(out.split('\n\n').filter(x => x === p).length, 1);
  assert.equal(out.split('\n\n').length, 2);
});

test('dedupeParagraphs never drops a verse placeholder or an axis title', () => {
  const masked = 'المحور الأول: س\n\n@@VERSE_0@@\n\n@@VERSE_1@@\n\nالمحور الأول: س';
  assert.equal(dedupeParagraphs(masked), masked);
});

test('4. dedupeVersesPerAxis: first citation per axis only; the same verse is allowed in another axis', () => {
  const v = '﴿نص﴾ [العلق: 17]';
  const out = dedupeVersesPerAxis(`المحور الأول: أ\n${v}\nكلام\n${v}\nالمحور الثاني: ب\n${v}\n`);
  const [first, second] = out.split('المحور الثاني');
  assert.equal(first.split('[العلق: 17]').length - 1, 1);
  assert.equal(second.split('[العلق: 17]').length - 1, 1);
});

test('5. mergeAdjacentVerses joins consecutive ayahs of one surah only', () => {
  assert.equal(mergeAdjacentVerses('﴿أ﴾ [العلق: 17]\n﴿ب﴾ [العلق: 18]'), '﴿أ ب﴾  [العلق: 17-18]');
  assert.equal(mergeAdjacentVerses('﴿أ﴾ [العلق: 17]\n﴿ب﴾ [العلق: 18]\n﴿ج﴾ [العلق: 19]'), '﴿أ ب ج﴾  [العلق: 17-19]');
  const otherSurah = '﴿أ﴾ [العلق: 17]\n﴿ب﴾ [القلم: 18]';
  assert.equal(mergeAdjacentVerses(otherSurah), otherSurah);
  const notConsecutive = '﴿أ﴾ [العلق: 17]\n﴿ب﴾ [العلق: 19]';
  assert.equal(mergeAdjacentVerses(notConsecutive), notConsecutive);
});

test('6. fixClosings: the closing line once, at the very end', () => {
  const out = fixClosings('فقرة. وللحديث بقية.\n\nوهذا ما سنتناوله في الجزء القادم.\n\nوهذا ما سنتناوله – بحول الله – في الجزء القادم.\n\nوللحديث بقية...\n\nوللحديث تتمة');
  assert.equal(out.match(/وللحديث/g)?.length, 1);
  assert.ok(out.endsWith(`\n\n${CLOSING_LINE}`));
  assert.equal(out.match(/وهذا ما سنتناوله/g)?.length, 1);
  assert.ok(out.includes('وهذا ما سنتناوله – بحول الله – في الجزء القادم.'), 'the last one is kept');
});

test('7. dropEchoedHeadings: a sub-heading echoing its axis goes, a different one stays', () => {
  const out = dropEchoedHeadings('المحور الأول: دلالة الطهارة في قصة لوط\nدلالة الطهارة في قصة لوط\nأولاً: الطهارة والرجس\nفقرة.');
  assert.equal(out, 'المحور الأول: دلالة الطهارة في قصة لوط\nأولاً: الطهارة والرجس\nفقرة.');
});

test('stripHeritageSentences: heritage sentences go even with proclitics; others stay', () => {
  const out = stripHeritageSentences('نبدأ من النص. وهذا من الركام الموروث في الكتب. وليس كما يحلو للبعض أن يصور. والتراث يقول كذا! ونحن نرى أن اللفظ مقصود.');
  assert.equal(out.replace(/\s+/g, ' ').trim(), 'نبدأ من النص. ونحن نرى أن اللفظ مقصود.');
});

test('blocks: verses untouched, de-duplicated per axis and merged; prose sanitized; one closing line', () => {
  type Block = { type: string; text: string; ref?: string };
  const verse = (ref: string, text: string): Block => ({ type: 'verse', ref, text });
  const article = {
    opening: 'وصلنا في الجزء السابق إلى أن الطهارة كونية.',
    closing: 'وهذا ما سنتناوله في الجزء القادم. وللحديث بقية.\n\nوللحديث بقية',
    sections: [
      {
        axisName: 'دلالة الطهارة',
        blocks: <Block[]>[
          { type: 'heading', text: 'المحور الأول: دلالة الطهارة' },
          { type: 'subheading', text: 'دلالة الطهارة' },
          { type: 'paragraph', text: '؟ نحن نرى والله أعلم أن الطهارة في هذا السياق كونية لا جسدية.' },
          verse('العلق:17', 'فَلْيَدْعُ نَادِيَهُۥ'),
          verse('العلق:18', 'سَنَدْعُ ٱلزَّبَانِيَةَ'),
          { type: 'paragraph', text: 'وصلنا في الجزء السابق إلى كذا. وفي التفاسير قول آخر. نحن نرى والله أعلم أن الطهارة في هذا السياق كونية لا جسدية.' },
          verse('العلق:17', 'فَلْيَدْعُ نَادِيَهُۥ'),
          { type: 'paragraph', text: 'وهذا ما سنتناوله في الجزء القادم. والنتيجة: الطهارة كونية. وللحديث بقية.' },
          { type: 'heading', text: 'المحور الأول: دلالة الطهارة' },
        ],
      },
      { axisName: 'السبيل', blocks: [verse('العلق:17', 'فَلْيَدْعُ نَادِيَهُۥ')] },
    ],
  };
  const out = sanitizeArticleBlocks(article);
  const [a, b] = out.sections;
  assert.deepEqual(a.blocks.map(x => x.type === 'verse' ? `v ${x.ref}` : x.text), [
    'المحور الأول: دلالة الطهارة',
    'نحن نرى والله أعلم أن الطهارة في هذا السياق كونية لا جسدية.',
    'v العلق:17-18',
    'والنتيجة: الطهارة كونية.',
  ]);
  assert.equal(a.blocks[2].text, 'فَلْيَدْعُ نَادِيَهُۥ سَنَدْعُ ٱلزَّبَانِيَةَ', 'merged verse text is the two Tanzil texts, untouched');
  assert.equal(b.blocks.length, 1, 'the same verse is allowed in another axis');
  assert.equal(out.closing, `وهذا ما سنتناوله في الجزء القادم.\n\n${CLOSING_LINE}`);
  assert.equal(out.opening, article.opening);
});

test('sanitizeProse: clichés, closing sentences and orphan punctuation', () => {
  assert.equal(sanitizeProse('؟ السؤال الذي يطرح نفسه بقوة: لماذا؟ وللحديث بقية'), 'والسؤال هنا: لماذا؟');
  assert.equal(sanitizeProse('فنعود لنطرح السؤال نفسه: من القائل؟'), 'ونتساءل: من القائل؟');
});

test('a combined reference made of allowed ayahs is allowed (rule 9)', () => {
  assert.equal(isAllowedRef('العلق:17-18', ['العلق:17', 'العلق:18']), true);
  assert.equal(isAllowedRef('العلق:17-19', ['العلق:17', 'العلق:18']), false);
  assert.equal(isAllowedRef('هود:78', ['هود:77-80']), true);
});
