import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
  PageNumber,
  Header,
  Footer,
  BorderStyle,
  Table,
} from 'docx';
import { saveAs } from 'file-saver';
import type { PodcastScript, PodcastSpeaker } from '../types/podcast';
import { PODCAST_SPEAKERS } from '../types/podcast';
import { FONT, QURAN_ATTRIBUTION, run, verseBox } from './articleDocxExport';

// Word export of the recording script, ready for the studio: speaker names in bold
// colour, verses in the same gold boxes as the article export.

export const SPEAKER_DOCX_COLORS: Record<PodcastSpeaker, string> = {
  rasheed: '7A5C00',
  yousef: '1E3A8A',
  mustafa: '065F46',
  zakaria: '7F1D1D',
};

const speech = (speaker: PodcastSpeaker, text: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    bidirectional: true,
    spacing: { before: 100, after: 140, line: 400 },
    children: [
      run(`${PODCAST_SPEAKERS[speaker]}: `, { size: 26, bold: true, color: SPEAKER_DOCX_COLORS[speaker] }),
      run(text, { size: 26 }),
    ],
  });

const segmentHeading = (title: string) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    bidirectional: true,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4AF37', space: 4 } },
    children: [run(title, { size: 24, bold: true, color: '7A5C00' })],
  });

export async function exportPodcastToWord(script: PodcastScript) {
  const { episode } = script;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 80 },
      children: [run(episode.programName, { size: 40, bold: true, color: '7A5C00' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: `EPISODE ${episode.episodeNumber}`, font: 'Dosis', size: 28, bold: true, color: '1F2937' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 80 },
      children: [run(episode.dateText, { size: 22, color: '4B5563' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 300 },
      children: [run(`عن مقال: ${script.source.title}`, { size: 20, italics: true, color: '6B7280' })],
    }),
    segmentHeading('إخلاء المسؤولية'),
    speech('zakaria', episode.disclaimer),
  ];

  for (const segment of script.segments) {
    if (!segment.lines.length) continue;
    children.push(segmentHeading(segment.title));
    for (const line of segment.lines) {
      if (line.type === 'verse') children.push(verseBox(line), new Paragraph({ spacing: { after: 80 }, children: [] }));
      else if (line.speaker && line.text.trim()) children.push(speech(line.speaker, line.text));
    }
  }

  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    bidirectional: true,
    spacing: { before: 480 },
    children: [run(QURAN_ATTRIBUTION, { size: 16, color: '9CA3AF' })],
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1300, right: 1300, bottom: 1300, left: 1300 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [run(`${episode.programName} — EPISODE ${episode.episodeNumber}`, { size: 16, color: '9CA3AF' })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [run('صفحة ', { size: 18, color: '6B7280' }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: '6B7280' })],
          })],
        }),
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const name = `سكريبت الحلقة ${episode.episodeNumber} - ${script.source.title}`.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  saveAs(blob, `${name}.docx`);
}
