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
  disclaimer: string; // read by Zakaria before the introduction
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
