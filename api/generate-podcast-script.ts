// POST /api/generate-podcast-script — turns one segment of an article (the
// introduction, a part of an axis, or the closing) into studio dialog for the
// programme «نظرية الشبكة العنكبوتية», straight from the article text (no idea
// tree). The client splits the article into segments and calls this once per
// segment, in order. Verse lines carry only a reference; the client inserts the
// canonical (Tanzil) text. When Gemini is busy, the next model of the fallback
// chain writes the segment.

import type {
  PodcastSegmentKind,
  PodcastSegmentRequest,
  PodcastSegmentResponse,
  PodcastSpeaker,
  PodcastLeadHost,
} from '../src/types/podcast';
import {
  type ApiRequest,
  type ApiResponse,
  HttpError,
  handleJson,
  generateJson,
  isAllowedRef,
  canonicalRef,
  asString,
  asStringArray,
  stripReaderAddress,
} from './_lib/gemini.js';

const TIMEOUT_MS = 250_000; // under the function's 300 s (vercel.json)
const MAX_OUTPUT_TOKENS = 16384; // a ~1,400-word segment becomes ~2,000 words of dialog
const MAX_SOURCE_CHARS = 20_000;
// The introduction recaps the previous episode from its full text (~12,000 words)
const MAX_PREVIOUS_EPISODE_CHARS = 80_000;
const MAX_PREVIOUS_LINES = 6;
const KINDS = new Set<PodcastSegmentKind>(['intro', 'body', 'closing']);
const COMMENT_SLOT = '...'; // same as src/types/podcast.ts

// Lively but faithful; the penalty discourages repeated verbal tics. Gemini 3.6+
// ignores temperature: the prompt's rules carry the same intent.
export const SAMPLING = { temperature: 0.5, frequencyPenalty: 0.4 };

// Same names as PODCAST_SPEAKERS / VERSE_SPEAKER in src/types/podcast.ts (only
// types are imported from src: the functions run as plain ESM on the server)
const NAMES: Record<Exclude<PodcastSpeaker, 'yousef'>, string> = {
  zakaria: 'زكريا',
  mustafa: 'مصطفى',
  mohammed: 'محمد',
  rasheed: 'د. رشيد الجراح',
  ali: 'أ. علي الشرمان',
};
const VERSE_SPEAKER = 'آية';
const LEAD_HOSTS: PodcastLeadHost[] = ['zakaria', 'mustafa'];

// Who speaks after the lead host in the opening relay, before handing back to him
const RELAY: Record<PodcastLeadHost, [keyof typeof NAMES, keyof typeof NAMES]> = {
  zakaria: ['mohammed', 'mustafa'],
  mustafa: ['zakaria', 'mohammed'],
};

const speakersOf = (coGuest: boolean) =>
  (Object.keys(NAMES) as (keyof typeof NAMES)[]).filter(s => coGuest || s !== 'ali');

function schemaFor(req: PodcastSegmentRequest) {
  return {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            speaker: { type: 'string', enum: [...speakersOf(req.coGuest).map(s => NAMES[s]), VERSE_SPEAKER] },
            text: { type: 'string' },
            ref: { type: 'string' },
          },
          required: ['speaker', 'text'],
        },
      },
      ...(req.kind === 'closing' ? { interruptions: { type: 'array', items: { type: 'string' } } } : {}),
    },
    required: req.kind === 'closing' ? ['lines', 'interruptions'] : ['lines'],
  };
}

// ---- Prompt ----------------------------------------------------------------------

// The client's golden introduction: the only binding model of depth, length and
// tone for the opening (sent with the introduction call only). Its cast is that
// of an earlier season: د. يوسف = the lead, مصطفى = the second, زكريا = the third.
const GOLDEN_INTRO = `د. يوسف: بسم الله الرحمن الرحيم. أهلًا ومرحبًا بكم مستمعينا الأعزاء في حلقة جديدة من سلسلة نظرية الشبكة العنكبوتية مع الدكتور رشيد الجراح بتاريخ [التاريخ].
هدفنا في هذه الدقائق التمهيدية هو استرجاع الخيوط الأساسية التي نسجناها في اللقاء السابق؛ لنبني عليها مسار حوارنا الليلة بشكل منهجي متصل. لقد افتتح الدكتور رشيد أطروحته بتفكيك الروايات الموروثة التي تجعل لوطاً ابن أخ لإبراهيم عليهما السلام، معتبراً إياها مدفوعة بإسرائيليات لا يدعمها الذكر الحكيم. فالتأسيس المنهجي القرآني يفصل تماماً بين "قوم إبراهيم" و"قوم لوط"، ولكل نبي منهما لسان خاص أُرسل به، مما قادنا إلى افتراء الظن أن الرابطة التي جمعت بين البيتين هي علاقة مصاهرة وقربى من جهة النساء سابقة على الرسالة، وليست قرابة دم من جهة الآباء. كما عالجنا البعد الزمني لعمر النبيين؛ فالقرآن يصف إبراهيم إبان مواجهته للأصنام بصفة "الفتى"، مما دفع الدكتور رشيد الى افتراء الظن إلى حداثة سنه في تلك الواقعة، بينما تشير المعطيات إلى أن لوطاً كان رجلاً مكتمل النضج يعيش بين أهله وقومه، وبالتالي فهو على الأرجح أكبر سناً من إبراهيم. لكن هذه النتائج العملية مبنية على تصور أعمق، ما رأيك يا مصطفى.

مصطفى: أهلاً بيك يا دكتور يوسف، وأهلاً بكل متابعينا. الحقيقة العمق الفكري اللي طرحه الدكتور رشيد تمثل في إعادة رسم اللحظة الفاصلة في حياة النبيين؛ لحظة ما انتشر خبر تحريق الفتى إبراهيم، فتحرك لوط من موطنه ليشهد الواقعة، ورأى المعجزة كاملة: النار أصبحت برداً وسلاماً، والبنيان تم الاتيان عليه من قواعده فخر السقف على القوم وآتهم العذاب من حيث لا يشعرون. ومن خلال المشهد ده كان السؤال الأهم ليه النص جه "فآمن له لوط" مش "فآمن به لوط" وبالتالي انتقلنا الى التحليل العديد من السياقات القرانية للنظر في التدقيق اللساني البديع في الفرق بين "آمن به" و"آمن له"؛ فالإيمان "بـ" هو تصديق عقائدي قلبي للرسالة قد لا يرتبط بحوادث حسية، بينما الإيمان "لـ" هو إيمان ناتج عن معاينة الآيات والمعجزات على أرض الواقع، زي ما حصل مع سحرة فرعون وبني إسرائيل تجاه موسى عليه السلام. فلوط كان مؤمناً بإبراهيم وبربه من البداية، لكنه "آمن له" بعد ما عاين البينة بعينيه وزال عنه أي تردد. وانتهينا الى افتراء الظن انه لوط كان في الأساس مؤمن ولكن كان يكتم ايمانه وفي اللحظة التي راي فيها إبراهيم يخرج من نار قومه سالما هنا جهر بهذا الايمان وانتقل الى انه آمن لـ إبراهيم، وهذا العمق الفكري ينقلنا الى الجزء الاخير، وهنا يأتي دورك يا زكريا.

زكريا: شكرًا لك أخي مصطفى. ومن ذلك الايمان المشهود، انطلقنا في الحلقة الماضية لفض إشكال لطالما حيّر أذهان المتدبرين في قوله تعالى: > قال تعالى: {وَقَالَ إِنِّي مُهَاجِرٌ إِلَى رَبِّي} [العنكبوت: 26]؛ إذ رجح الدكتور رشيد أن المتحدث بالهجرة هو إبراهيم عليه السلام؛ لكون الهجرة لزومًا تعني مفارقة الوطن ومغادرة الديار بعد نزول العذاب بقومه، في حين لم يكن خروج لوط خروج هجرة بل عودة إلى قومه الذين أُرسل لهم لاحقا، لتبدأ قصة لوط مع قومه، مصداقًا لقوله الحق: > قال تعالى: {وَإِنَّ لُوطًا لَمِنَ الْمُرْسَلِينَ} [الصافات: 133]. كما وقفنا عند دلالة النجاة المشتركة في قوله تعالى: > قال تعالى: {وَنَجَّيْنَاهُ وَلُوطًا إِلَى الْأَرْضِ الَّتِي بَارَكْنَا فِيهَا لِلْعَالَمِينَ} [الأنبياء: 71]؛ فخلصنا إلى أن الخلاص شمل النبيين معًا، ولكن في زمانين مختلفين ومن عذاب قومين مستقلين؛ حيث وصل إبراهيم إلى تلك البقعة المباركة بعد نجاته من نار قومه، بينما لحق به لوط ملتمسًا الهدى ومرافقًا له لينال "الحكم والعلم" قبل أن يعود ليواجه منكرات قومه. وبهذا التأصيل نكون قد أحطنا بالموضوع من معظم جوانبه. تفضل يا د.يوسف ببدء النقاش مع الدكتور رشيد.

د.يوسف: أهلاً بكم متابعينا الأفاضل في هذه الحلقة الجديدة من برنامجنا "نظرية الشبكة العنكبوتية". ونرحب بضيفنا الكريم الدكتور رشيد الجراح. لنكمل ما قد بدأناه في الحلقة الماضية من إعاده حبك خيوط قصة لوط مع قومه وبعد ما استمعنا الى اهم الأفكار التي تحدثنا فيها في الحلقة الماضية، نود ان نبدأ حوار الليلة معك حول أسم الرسول لوط نفسه فما دلالة هذا الاسم وما معناه؟`;

const PROFILES = `## ملفات الشخصيات (ثابتة)
المحاورون:
- ${NAMES.zakaria} (اللغوي / الأصيل): عربية فصحى رصينة، يركّز على التأصيل اللغوي والشرعي للألفاظ.
- ${NAMES.mustafa} (المدقق / المحلل): مصرية بيضاء مثقفة، يركّز على العمق الفكري والنقد الموضوعي.
- ${NAMES.mohammed} (الواقعي / المنهجي): مصرية بيضاء مثقفة، يركّز على التطبيقات العملية والنتائج.
الضيوف:
- ${NAMES.rasheed} (الضيف الرئيسي): يلتزم حرفياً بنص المقال الأصلي، ويتمسك بمصطلحاته الحصرية: «نفتري الظن»، «لغو الأعراب»، «اللسان العربي المبين»، «افتراء من عند أنفسنا»، «والله أعلم».`;

function systemPrompt(req: PodcastSegmentRequest): string {
  const lead = NAMES[req.leadHost];
  const ali = req.coGuest
    ? `\n- ${NAMES.ali} (ضيف مشارك): يشارك ${NAMES.rasheed} الإجابات بالتناوب، من نص المقال وحده كذلك.`
    : `\n- لا ضيف مشارك في هذه الحلقة: ${NAMES.rasheed} هو الضيف الوحيد.`;
  const guests = req.coGuest ? `${NAMES.rasheed} و${NAMES.ali}` : NAMES.rasheed;
  return `أنت محرر سكريبتات صوتية لبرنامج «${req.programName}»، برنامج حواري يقدّم أبحاث أ.د. رشيد الجراح في تدبّر القرآن الكريم.
مهمتك تحويل نص مقال إلى حوار مكتوب يُقرأ في الاستوديو كما هو، دون أن يضيع شيء من مادته.

${PROFILES}${ali}

قائد هذه الحلقة: ${lead}؛ هو من يفتتح ويدير ويختتم.

## الالتزام بالمصدر (صارم)
1. نص المقال هو المصدر الوحيد لإجابات الضيوف (${guests}): كل فكرة وحجة ونتيجة وآية فيه، بالترتيب نفسه، وبألفاظه قدر الإمكان مع تحويلها إلى لغة منطوقة. لا تضف معلومة ليست فيه، ولا تحذف شيئاً منه.
2. المحاورون يسألون ويستوضحون ويعقّبون بإيجاز؛ لا يقدّمون من عندهم معلومة علمية غير موجودة في المقال.
3. المنهج: التحليل يقتصر على النص القرآني؛ لا نقل عن أهل التراث أو المفسرين، ولا قصصهم، ولا الإسرائيليات، ولا مقارنة مع من كتب في الموضوع، ولو سأل المحاور عن ذلك.

## بروتوكول المقص الذكي
4. حد الحديث المتصل: لا يتكلم الضيف أكثر من 200 إلى 250 كلمة متواصلة (دقيقة ونصف إلى دقيقتين)، والآيات التي يتلوها داخلة في كلامه المتصل. اقطع الشرح عند نقطة توقف منطقية، ثم يطرح أحد المحاورين سؤالاً استيضاحياً مبنياً على آخر ما قاله الضيف، دون أن يحرق الإجابة التالية.
5. المساحة الفارغة للتعقيب: إذا طلب المحاور من ضيف أن يعقّب على كلام ضيف آخر، فسطر المعقِّب ثلاث نقاط حصراً: {"speaker":"<اسم الضيف>","text":"${COMMENT_SLOT}"} — لا تكتب تعقيباً ليس في المقال.
6. نوّع صيغ الأسئلة والتعقيبات، ولا تكرر اللوازم الكلامية («بالضبط»، «سؤال جميل»، «أحسنت»…) ولا افتتاحيات الجمل نفسها.

## الآيات
7. الآيات في نص المصدر مكتوبة بالصيغة الموحدة: > قال تعالى: {نص الآية} [اسم السورة: رقم الآية]. كل آية تستشهد بها تُورد عنصراً مستقلاً {"speaker":"${VERSE_SPEAKER}","text":"","ref":"سورة:آية"} في موضعها من كلام المتحدث، فيطبعها النظام بالصيغة الموحدة نفسها مع «قال تعالى:» ونص الآية الموثّق. لا تكتب «قال تعالى:» قبلها ولا نص الآية ولا الأقواس داخل الكلام، واترك text فارغاً، واختر ref من القائمة المسموح بها فقط.

## عام
8. يتنادى المتحاورون بأسمائهم طبيعياً. الترحيب بالمستمعين في المقدمة والخاتمة فقط. لا «عزيزي القارئ» ولا «سيدي» ولا «سيادتكم».
9. إخلاء المسؤولية المنهجي نص ثابت يقرؤه ${lead} قبل هذا الحوار ويدرجه النظام؛ لا تكتبه ولا تكرره.
10. نص منطوق فقط: لا عناوين ولا ترقيم ولا إرشادات إخراج.

${req.kind === 'intro' ? `## نموذج المقدمة الذهبي المعتمد — التزم بنفس العمق والطول والطبيعة الحوارية
(أسماؤه من موسم سابق: د. يوسف هو القائد، ومصطفى الثاني، وزكريا الثالث. في هذه الحلقة: ${lead} القائد، ثم ${NAMES[RELAY[req.leadHost][0]]}، ثم ${NAMES[RELAY[req.leadHost][1]]}. الآيات فيه مكتوبة بالصيغة الموحدة؛ أنت تكتبها عناصر آيات مستقلة.)

${GOLDEN_INTRO}

` : ''}## الإخراج
أرجع JSON فقط: {"lines":[{"speaker":"…","text":"…","ref":"…"}]${req.kind === 'closing' ? ',"interruptions":["…"]' : ''}}، حيث speaker أحد: ${speakersOf(req.coGuest).map(s => NAMES[s]).join('، ')}، ${VERSE_SPEAKER}؛ و ref لعناصر الآيات فقط.`;
}

function segmentInstructions(req: PodcastSegmentRequest): string {
  const lead = NAMES[req.leadHost];
  const [second, third] = RELAY[req.leadHost].map(s => NAMES[s]);
  const leadVoice = req.leadHost === 'zakaria' ? 'بالفصحى' : 'بالمصرية البيضاء المثقفة';
  const topics = req.topics.length ? req.topics.map(t => `- ${t}`).join('\n') : '—';
  switch (req.kind) {
    case 'intro':
      return `# المطلوب: المقدمة التمهيدية (قائد الحلقة ${lead}) — بعمق النموذج الذهبي وطوله وطبيعته الحوارية
قرأ ${lead} إخلاء المسؤولية المنهجي للتو. المقدمة استرجاع تحليلي دسم لخيوط الحلقة السابقة من نصها أدناه، لا فهرس لها.

## ممنوع منعاً باتاً
- جمل الفهرسة الشكلية مثل: «في هذا الجزء سنستعرض»، «في الثلث الأول سنناقش»، «في الثلث الأخير سنغوص»، «أحيل الكلمة لزميلي ليطلعنا على المحور الثاني».
- الكلام العام السطحي، والإعلان عن الموضوعات بدل عرض مضمونها، واختصار الحجج إلى عناوين.

## المطلوب في كل مداخلة: تفاصيل الحلقة السابقة نفسها — قضاياها وأدلتها وآياتها ونتائجها ومصطلحاتها («افتراء الظن»، «التأسيس المنهجي القرآني»…)
1. ${lead} (${leadVoice}، 180 إلى 280 كلمة): بسملة وترحيب بالمستمعين في «${req.programName}» مع الدكتور رشيد الجراح${req.dateText ? ` بتاريخ ${req.dateText}` : ''}، ثم يدخل مباشرة في تفكيك القضية الفكرية أو التاريخية أو اللغوية الكبرى في الحلقة السابقة، بأدلتها وما انتهت إليه، ثم يسلّم الكلمة لـ${second} بعبارة حوارية تربط بما بعدها («لكن هذه النتائج مبنية على تصور أعمق، ما رأيك يا ${second}؟»).
2. ${second} (180 إلى 280 كلمة): يأخذ الخيط ويدخل في تدقيق لساني أو فلسفي أعمق من الحلقة السابقة (فروق الألفاظ والتراكيب ودلالاتها، والمعاينة مقابل التصديق…) مستشهداً بالآيات، ثم يسلّم لـ${third} بعبارة حوارية ذكية.
3. ${third} (180 إلى 280 كلمة): يفكك إشكالاً نصياً أو عقدياً آخر من الحلقة السابقة (من القائل، ودلالة لفظ، وما ترتب عليه) مستشهداً بالآيات، ثم يختم ويعيد الكلمة لـ${lead} ليبدأ النقاش مع الدكتور رشيد.
4. ${lead} (60 إلى 120 كلمة): يرحّب بالمستمعين وبضيفنا الدكتور رشيد الجراح${req.coGuest ? ' وبالأستاذ علي الشرمان' : ''}، ويربط بما سبق، ثم يطرح السؤال التفكيكي الأول العميق عن موضوع الليلة (من افتتاحية المقال الحالي وموضوعات الحلقة أدناه).
- كل ما يُذكر في المداخلات الثلاث الأولى مأخوذ من نص الحلقة السابقة وحده؛ وإن لم يُرفق نصها فمن تلخيص الكاتب في افتتاحية المقال الحالي، دون إضافة شيء ليس فيهما.
- كل آية تُذكر عنصر آية مستقل بمرجعها، في موضعها من كلام المحاور.
- لا يتكلم الضيوف في هذا المقطع.

# موضوعات الحلقة الحالية (المقاطع القادمة)
${topics}`;
    case 'closing': {
      const highlights = req.highlights?.length ? req.highlights.map(h => `- ${h}`).join('\n') : '—';
      return `# المطلوب: خاتمة الحلقة
- إن كان في نص المقطع تمهيد للجزء القادم أو دعاء، يقوله د. رشيد باختصار وبألفاظه.
- ثم يختتم ${lead} (قائد الحلقة) ${leadVoice}: شكر الضيوف و${second} و${third}، وتوديع المستمعين، والدعوة إلى متابعة الحلقة القادمة. من ٣ إلى ٦ مداخلات.
- interruptions: بنك مقاطعات من 5 إلى 8 أسئلة مقاطعة قصيرة بديلة يستعين بها مخرج الصوت في المونتاج، موزّعة على موضوعات الحلقة، يبدأ كل سؤال باسم المحاور الذي يطرحه («${NAMES.mustafa}: …»)، ولا يحرق إجابة.

# موضوعات الحلقة ومفاتيحها
${topics}
${highlights}`;
    }
    default:
      return `# المطلوب: المقطع ${req.segmentIndex} من ${req.bodyCount} في متن الحلقة — «${req.segmentTitle}»
- واصل الحوار من حيث انتهى (آخر الأسطر أدناه): إن كان آخر سطر سؤالاً للضيف فابدأ بجوابه، وإلا فابدأ بسؤال ينقل إلى هذا المقطع.
- حوّل نص المقطع كاملاً إلى حوار وفق القواعد والمقص الذكي، ووزّع الأسئلة على المحاورين الثلاثة بحسب ملفاتهم. لا تختم الحلقة ولا تودّع${req.segmentIndex < req.bodyCount ? '، فالحوار يستمر بعده' : ''}.`;
  }
}

export function buildPodcastPrompt(req: PodcastSegmentRequest): { system: string; prompt: string } {
  const previous = req.previousLines?.length
    ? `# آخر الحوار قبل هذا المقطع\n${req.previousLines.join('\n')}\n\n`
    : '';
  const instruction = req.instruction ? `\n\n# ملاحظة المستخدم لإعادة الكتابة (التزم بها)\n${req.instruction}` : '';
  const prompt = `# الحلقة
البرنامج: ${req.programName} — الحلقة ${req.episodeNumber}
قائد الحلقة: ${NAMES[req.leadHost]}${req.coGuest ? `\nالضيف المشارك: ${NAMES.ali}` : ''}
المقال: ${req.articleTitle}

${segmentInstructions(req)}

${previous}${req.kind === 'intro' && req.previousEpisodeText ? `# نص الحلقة السابقة${req.previousEpisodeTitle ? ` — «${req.previousEpisodeTitle}»` : ''} (مصدر المقدمة)
${req.previousEpisodeText}

` : ''}# ${req.kind === 'intro' ? 'افتتاحية المقال الحالي (تلخيص الكاتب للجزء السابق)' : 'نص المقطع'}${req.kind === 'body' ? ` — «${req.segmentTitle}»` : ''}
${req.sourceText}

# المراجع المسموح بها للآيات
${req.allowedVerseRefs.join('، ') || '— (لا آيات في هذا المقال)'}${instruction}`;
  return { system: systemPrompt(req), prompt };
}

// ---- Output ----------------------------------------------------------------------

const VERSE_SPAN_RE = /[﴾﴿{]([^﴾﴿{}]*)[﴾﴿}]\s*(?:[[(]([^\])]+)[\])])?/g;
// «> قال تعالى:» at the end of the line before a verse: the block prints it. The
// speaker's own lead-in stays («في قوله تعالى:»), as in the golden introduction.
const LEAD_IN_RE = /\s*>?\s*قال تعالى\s*:?\s*>?\s*$/;

// Keeps the episode's cast and allowed verse refs; a verse quoted inside a line
// becomes a verse line when its reference is allowed, and is dropped otherwise.
// A guest's comment slot stays exactly «...».
export function normalizePodcast(
  raw: { lines?: unknown; interruptions?: unknown },
  req: PodcastSegmentRequest
): Omit<PodcastSegmentResponse, 'model'> {
  const byName = new Map(speakersOf(req.coGuest).map(s => [NAMES[s], s as PodcastSpeaker]));
  const lines: PodcastSegmentResponse['lines'] = [];
  const rejectedRefs: string[] = [];
  const pushVerse = (ref: string | undefined) => {
    const r = ref?.trim();
    if (!r || !isAllowedRef(r, req.allowedVerseRefs)) {
      rejectedRefs.push(r || 'نص آية بلا مرجع');
      return;
    }
    // The verse block prints «قال تعالى:» itself: no second one at the end of the line before
    const last = lines[lines.length - 1];
    if (last?.type === 'speech') {
      last.text = last.text.replace(LEAD_IN_RE, '').trim();
      if (!last.text) lines.pop();
    }
    lines.push({ type: 'verse', text: '', ref: canonicalRef(r) });
  };

  for (const item of Array.isArray(raw.lines) ? raw.lines : []) {
    if (!item || typeof item !== 'object') continue;
    const name = asString((item as Record<string, unknown>).speaker).trim();
    if (name === VERSE_SPEAKER) {
      pushVerse(asString((item as Record<string, unknown>).ref));
      continue;
    }
    const speaker = byName.get(name);
    if (!speaker) continue;
    const rawText = asString((item as Record<string, unknown>).text).trim();
    if (rawText && /^[.…\s]+$/.test(rawText)) {
      if (speaker === 'rasheed' || speaker === 'ali') lines.push({ type: 'speech', speaker, text: COMMENT_SLOT });
      continue;
    }
    const text = stripReaderAddress(rawText.replace(/(^|\s)>\s*/g, '$1'));
    if (!text) continue;
    if (!/[﴾﴿{]/.test(text)) {
      lines.push({ type: 'speech', speaker, text });
      continue;
    }
    let cursor = 0;
    for (const m of text.matchAll(VERSE_SPAN_RE)) {
      const before = text.slice(cursor, m.index).trim();
      if (before) lines.push({ type: 'speech', speaker, text: before });
      pushVerse(m[2]);
      cursor = m.index! + m[0].length;
    }
    const after = text.slice(cursor).trim();
    if (after) lines.push({ type: 'speech', speaker, text: after });
  }

  if (!lines.some(l => l.type === 'speech')) throw new HttpError(502, 'لم يُرجع النموذج حواراً صالحاً لهذا المقطع');
  const interruptions = req.kind === 'closing'
    ? asStringArray(raw.interruptions).map(q => q.trim()).filter(Boolean).slice(0, 8)
    : undefined;
  return { lines, ...(interruptions ? { interruptions } : {}), ...(rejectedRefs.length ? { rejectedRefs } : {}) };
}

function validateInput(body: Record<string, unknown>): PodcastSegmentRequest {
  const kind = asString(body.kind) as PodcastSegmentKind;
  if (!KINDS.has(kind)) throw new HttpError(400, 'نوع المقطع غير معروف (intro | body | closing)');
  const sourceText = asString(body.sourceText).trim();
  if (!sourceText) throw new HttpError(400, 'نص المقطع فارغ');
  if (sourceText.length > MAX_SOURCE_CHARS) throw new HttpError(413, `نص المقطع أطول من ${MAX_SOURCE_CHARS} حرف`);
  const episodeNumber = Number(body.episodeNumber);
  const instruction = asString(body.instruction).trim();
  return {
    kind,
    programName: asString(body.programName).trim() || 'نظرية الشبكة العنكبوتية',
    episodeNumber: Number.isFinite(episodeNumber) && episodeNumber > 0 ? Math.round(episodeNumber) : 1,
    leadHost: LEAD_HOSTS.includes(body.leadHost as PodcastLeadHost) ? (body.leadHost as PodcastLeadHost) : 'zakaria',
    coGuest: body.coGuest === true,
    articleTitle: asString(body.articleTitle).trim(),
    segmentTitle: asString(body.segmentTitle).trim(),
    segmentIndex: Number(body.segmentIndex) || 0,
    bodyCount: Number(body.bodyCount) || 0,
    topics: asStringArray(body.topics).slice(0, 30),
    highlights: asStringArray(body.highlights).slice(0, 30).map(h => h.slice(0, 300)),
    dateText: asString(body.dateText).trim().slice(0, 200),
    ...(kind === 'intro' && asString(body.previousEpisodeText).trim()
      ? {
          previousEpisodeText: asString(body.previousEpisodeText).trim().slice(0, MAX_PREVIOUS_EPISODE_CHARS),
          previousEpisodeTitle: asString(body.previousEpisodeTitle).trim().slice(0, 300),
        }
      : {}),
    sourceText,
    allowedVerseRefs: asStringArray(body.allowedVerseRefs),
    previousLines: asStringArray(body.previousLines).slice(-MAX_PREVIOUS_LINES),
    ...(instruction ? { instruction: instruction.slice(0, 2000) } : {}),
  };
}

// ---- Auto-recovery -----------------------------------------------------------------

// When a model is busy (429 / 503), unreachable or not available to the key, the
// next one writes the segment: the chosen model first, then the chain
// gemini-3.8-flash → gemini-3.6-flash → gemini-3.5-flash-lite → gemini-3.1-pro-preview.
export const FALLBACK_CHAIN = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'];
export const recoveryConfig = { delayMs: 2000, minAttemptMs: 30_000 };

export const modelsToTry = (chosen: string) => [chosen, ...FALLBACK_CHAIN.filter(m => m !== chosen)];

// The introduction needs deeper reasoning: gemini-3.8-flash, then gemini-3.6-flash,
// whatever the chosen model (unless it is the Pro one), then the rest of the chain
export const INTRO_MODELS = ['gemini-3.8-flash', 'gemini-3.6-flash'];
export const introModelsToTry = (chosen: string) =>
  [...new Set([...(/pro/.test(chosen) ? [chosen] : []), ...INTRO_MODELS, ...modelsToTry(chosen)])];

const isBusy = (e: unknown) => e instanceof HttpError && (e.status === 429 || e.status === 503);
const isUnavailableModel = (e: unknown) => e instanceof HttpError && e.status === 502 && /غير متاح لهذا المفتاح/.test(e.message);
const isNetwork = (e: unknown) =>
  !(e instanceof HttpError) && (e instanceof TypeError || /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(String((e as Error)?.message ?? e)));
// A model that rejects temperature / frequencyPenalty: the same model again without them
const rejectsSampling = (e: unknown) => e instanceof HttpError && /\(400\)/.test(e.message) && /temperature|penalty|frequency/i.test(e.message);

export async function withFallback<T>(
  models: string[],
  attempt: (model: string, timeoutMs: number, withSampling: boolean) => Promise<T>
): Promise<{ result: T; model: string }> {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    let withSampling = true;
    for (;;) {
      try {
        return { result: await attempt(model, deadline - Date.now(), withSampling), model };
      } catch (e) {
        lastError = e;
        if (withSampling && rejectsSampling(e)) {
          withSampling = false;
          continue;
        }
        break;
      }
    }
    const recoverable = isBusy(lastError) || isNetwork(lastError) || isUnavailableModel(lastError);
    const delay = isUnavailableModel(lastError) ? 0 : recoveryConfig.delayMs;
    if (!recoverable || i === models.length - 1 || deadline - Date.now() - delay < recoveryConfig.minAttemptMs) throw lastError;
    console.warn(`podcast script: ${model} failed (${(lastError as Error)?.message ?? lastError}); trying ${models[i + 1]}`);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw lastError;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  return handleJson(req, res, async (body, apiKey, chosenModel): Promise<PodcastSegmentResponse> => {
    const request = validateInput(body);
    const { system, prompt } = buildPodcastPrompt(request);
    const intro = request.kind === 'intro';
    const models = intro ? introModelsToTry(chosenModel) : modelsToTry(chosenModel);
    const { result, model } = await withFallback(models, (model, timeoutMs, withSampling) =>
      generateJson<{ lines?: unknown; interruptions?: unknown }>({
        apiKey,
        model,
        system,
        prompt,
        schema: schemaFor(request),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        timeoutMs,
        // Long faithful rewriting: a little thinking keeps it complete; the
        // introduction analyses a whole episode and gets more
        effort: intro ? 'medium' : 'low',
        ...(withSampling ? { sampling: SAMPLING } : {}),
      })
    );
    return { ...normalizePodcast(result, request), model };
  });
}
