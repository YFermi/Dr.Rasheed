// npm test — the verses of the sources (verse density) and comparison bullets
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quranRefsIn, textVerseRefs } from '../../src/utils/quranRefs';
import { sanitizeArticleBlocks } from '../articleSanitizer';

test('verse references are read from the sources (brackets, «سورة», ranges, Arabic-Indic digits)', () => {
  assert.deepEqual(
    textVerseRefs('قال تعالى ﴿…﴾ [الأعراف: ٨٢] وكذلك (سورة هود: 78) و﴿…﴾ [الحجر: 73-74]'),
    ['الأعراف:82', 'هود:78', 'الحجر:73-74']
  );
});

test('only references that exist in the Quran are kept, with the canonical surah name', async () => {
  const refs = await quranRefsIn(['﴿…﴾ [الاعراف: 82] و﴿…﴾ [هود: 999] و﴿…﴾ [الحجر: 73-74]']);
  assert.ok(refs.includes('الحجر:73-74'));
  assert.ok(refs.some(r => r.endsWith(':82') && r.startsWith('الأعراف')), `canonical name: ${refs.join('، ')}`);
  assert.ok(!refs.some(r => r.startsWith('هود')), 'an ayah outside the surah is dropped');
});

test('comparison bullets are prose to the sanitizer: cleaned and de-duplicated, verses untouched', () => {
  const out = sanitizeArticleBlocks({
    opening: '',
    closing: '',
    sections: [{
      axisName: 'المقابلة',
      blocks: [
        { type: 'bullet', text: 'قوم لوط أتوا الفاحشة وقطعوا السبيل وأتوا في ناديهم المنكر.' },
        { type: 'verse', text: 'وَتَقطَعونَ السَّبيلَ', ref: 'العنكبوت:29' },
        { type: 'bullet', text: 'قوم لوط أتوا الفاحشة وقطعوا السبيل وأتوا في ناديهم المنكر.' },
        { type: 'bullet', text: '؟ إبراهيم هاجر إلى ربه ونجّاه الله إلى الأرض المباركة.' },
      ],
    }],
  });
  assert.deepEqual(out.sections[0].blocks.map(b => `${b.type}: ${b.text}`), [
    'bullet: قوم لوط أتوا الفاحشة وقطعوا السبيل وأتوا في ناديهم المنكر.',
    'verse: وَتَقطَعونَ السَّبيلَ',
    'bullet: إبراهيم هاجر إلى ربه ونجّاه الله إلى الأرض المباركة.',
  ]);
});
