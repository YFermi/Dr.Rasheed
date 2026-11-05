// Recording script («سكريبت التسجيل»): an article turned directly (no idea tree)
// into a studio dialog for «نظرية الشبكة العنكبوتية». Shared by the client and
// /api/generate-podcast-script.

// Hosts: zakaria, mustafa, mohammed. Guests: rasheed and, when invited, ali.
// 'yousef' only appears in scripts made before the current cast.
export type PodcastSpeaker = 'zakaria' | 'mustafa' | 'mohammed' | 'rasheed' | 'ali' | 'yousef';

// Display names, also the names the model writes
export const PODCAST_SPEAKERS: Record<PodcastSpeaker, string> = {
  zakaria: 'زكريا',
  mustafa: 'مصطفى',
  mohammed: 'محمد',
  rasheed: 'د. رشيد الجراح',
  ali: 'أ. علي الشرمان',
  yousef: 'د. يوسف',
};

export type PodcastHost = 'zakaria' | 'mustafa' | 'mohammed';
export type PodcastGuest = 'rasheed' | 'ali';
export const PODCAST_HOSTS: PodcastHost[] = ['zakaria', 'mustafa', 'mohammed'];
export const PODCAST_GUESTS: PodcastGuest[] = ['rasheed', 'ali'];

// Who can lead an episode (open it, recap the previous one, close it)
export type PodcastLeadHost = 'zakaria' | 'mustafa';
export const PODCAST_LEAD_HOSTS: PodcastLeadHost[] = ['zakaria', 'mustafa'];
export const DEFAULT_LEAD_HOST: PodcastLeadHost = 'zakaria';

export const isGuest = (s: PodcastSpeaker | undefined): s is PodcastGuest => s === 'rasheed' || s === 'ali';

// Smart cutter: a guest never speaks longer than this without a host's question
export const MAX_GUEST_RUN_WORDS = 250;
// A guest asked to comment on the other guest: an empty slot for the recording
export const COMMENT_SLOT = '...';

// Fixed text, inserted by the app (never written by the model) as the first
// line of every script, read by the lead host as part of his opening
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
  model?: string; // the Gemini model that wrote it (a fallback when the chosen one was busy)
}

export interface PodcastEpisode {
  programName: string;
  episodeNumber: number;
  dateText: string;
  leadHost?: PodcastLeadHost; // default DEFAULT_LEAD_HOST
  coGuest?: boolean; // أ. علي الشرمان shares the answers
  disclaimer: string; // always PODCAST_DISCLAIMER
}

export interface PodcastSource {
  kind: 'reference' | 'draft' | 'text'; // text: pasted or a Word file, straight from the window
  id: string;
  title: string;
}

export interface PodcastScript {
  id: string;
  source: PodcastSource;
  episode: PodcastEpisode;
  segments: PodcastSegment[];
  allowedVerseRefs: string[];
  interruptionBank?: string[]; // alternative interruption questions for the audio editor
  previousEpisode?: { title: string; text: string }; // the introduction recaps it
  generatedAt: string;
}

// ---- API ------------------------------------------------------------------------

export interface PodcastSegmentRequest {
  kind: PodcastSegmentKind;
  programName: string;
  episodeNumber: number;
  leadHost: PodcastLeadHost;
  coGuest: boolean;
  articleTitle: string;
  segmentTitle: string;
  segmentIndex: number; // 1-based among the body segments (0 for intro/closing)
  bodyCount: number;
  topics: string[]; // the body segments' titles (the intro announces them)
  highlights?: string[]; // closing only: the opening words of each body segment (for the interruption bank)
  dateText?: string;
  previousEpisodeText?: string; // intro only: the full previous episode, the source of the recap
  previousEpisodeTitle?: string;
  sourceText: string;
  allowedVerseRefs: string[];
  previousLines?: string[]; // «المتحدث: النص» of the dialog just before this segment
  instruction?: string; // the user's note when regenerating a segment
}

export interface PodcastSegmentResponse {
  lines: Array<{ type: 'speech' | 'verse'; speaker?: PodcastSpeaker; text: string; ref?: string }>;
  interruptions?: string[]; // closing only
  rejectedRefs?: string[];
  model: string;
}
