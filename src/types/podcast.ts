// Recording script («سكريبت التسجيل»): an article turned into a studio dialog
// between Dr. Rasheed and his team. Shared by the client and /api/generate-podcast-script.

export type PodcastSpeaker = 'yousef' | 'rasheed' | 'mustafa' | 'zakaria';

// Display names, also the names the model writes
export const PODCAST_SPEAKERS: Record<PodcastSpeaker, string> = {
  yousef: 'د. يوسف',
  rasheed: 'د. رشيد الجراح',
  mustafa: 'مصطفى',
  zakaria: 'زكريا',
};

// The hosts who can lead an episode (open it after the disclaimer, recap the
// previous one, close it)
export type PodcastHost = Exclude<PodcastSpeaker, 'rasheed'>;
export const PODCAST_HOSTS: PodcastHost[] = ['yousef', 'zakaria', 'mustafa'];
export const DEFAULT_LEAD_HOST: PodcastHost = 'yousef';

// Fixed text, inserted by the app (never written by the model) as the first
// line of every script, read by Zakaria
export const PODCAST_DISCLAIMER =
  'إخلاء مسؤولية وتوضيح منهجي: هذا المحتوى مُقدَّم لأغراض تعليمية، تحليلية، ونقدية بحتة. إن أي تناول لمصطلحات تاريخية، دينية، أو اجتماعية يهدف حصرًا إلى تحليل المفاهيم والأفكار والسلوكيات ضمن سياقها الأصلي، وهو لا يُمثّل بأي حالٍ من الأحوال حكمًا قيميًا أو تعميمًا سلبيًا على أي فئة اجتماعية أو قومية معاصرة. كما أن أي تفاعل عفوي أو مزاح يرد خلال الحوار لا يُقصد به الإساءة الشخصية أو التحرش. ونؤكد التزامنا التام بإرشادات المجتمع لجميع المنصات، ورفضنا لجميع أشكال خطاب الكراهية والصور النمطية الضارة. وأن جميع الأفكار والمفاهيم التي يتم تناولها في هذا الحوار مستندة إلى ما هو منشور في المدونة منذ أكثر من عشرين عامًا ويمكن أيضًا الوصول إلى المدونة بسهولة عبر البحث في محرك البحث جوجل باسم: الدكتور رشيد الجراح.';

// What the model writes for a verse line (its text is inserted by the client)
export const VERSE_SPEAKER = 'آية';

export type PodcastSegmentKind = 'intro' | 'body' | 'closing';

export interface PodcastLine {
  id: string;
  type: 'speech' | 'verse';
  speaker?: PodcastSpeaker; // speech lines
  text: string; // verse lines: canonical Tanzil text, filled in by the client
  ref?: string; // verse lines only
  unresolved?: boolean; // verse ref not found in the Quran text
}

export interface PodcastSegment {
  id: string;
  kind: PodcastSegmentKind;
  title: string;
  sourceText: string; // the article text this segment turns into dialog
  lines: PodcastLine[];
  status: 'pending' | 'generating' | 'done' | 'error';
  error?: string;
  rejectedRefs?: string[];
}

export interface PodcastEpisode {
  programName: string;
  episodeNumber: number;
  dateText: string;
  leadHost?: PodcastHost; // default DEFAULT_LEAD_HOST (scripts made before the choice existed)
  disclaimer: string; // always PODCAST_DISCLAIMER
}

export interface PodcastSource {
  kind: 'reference' | 'draft';
  id: string;
  title: string;
}

export interface PodcastScript {
  id: string;
  source: PodcastSource;
  episode: PodcastEpisode;
  segments: PodcastSegment[];
  allowedVerseRefs: string[];
  generatedAt: string;
}

// ---- API ------------------------------------------------------------------------

export interface PodcastSegmentRequest {
  kind: PodcastSegmentKind;
  programName: string;
  episodeNumber: number;
  leadHost: PodcastHost;
  articleTitle: string;
  segmentTitle: string;
  segmentIndex: number; // 1-based among the body segments (0 for intro/closing)
  bodyCount: number;
  topics: string[]; // the body segments' titles (the intro announces them)
  sourceText: string;
  allowedVerseRefs: string[];
  previousLines?: string[]; // «المتحدث: النص» of the dialog just before this segment
  instruction?: string; // the user's note when regenerating a segment
}

export interface PodcastSegmentResponse {
  lines: Array<{ type: 'speech' | 'verse'; speaker?: PodcastSpeaker; text: string; ref?: string }>;
  rejectedRefs?: string[];
}
