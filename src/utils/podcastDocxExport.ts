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
  ShadingType,
  PageBreak,
} from 'docx';
import { saveAs } from 'file-saver';
import type { PodcastLine, PodcastScript, PodcastSpeaker } from '../types/podcast';
import { COMMENT_SLOT, DEFAULT_LEAD_HOST, PODCAST_DISCLAIMER, PODCAST_SPEAKERS } from '../types/podcast';
import { FONT, QURAN_ATTRIBUTION, run } from './articleDocxExport';
import { verseBlockLines } from './podcastScript';

// Word export of the full recording script, ready for the studio (RTL A4): a cover
// page with the episode and the official disclaimer, the dialog (a new page for
// each axis), speaker names in bold colour, verses in the unified Quranic format,
// and the interruption bank on its own page at the end.

// Dr. Rasheed gold, Zakaria maroon, Mustafa green, Mohammed blue
export const SPEAKER_DOCX_COLORS: Record<PodcastSpeaker, string> = {
  rasheed: '9A7B10',
  zakaria: '881337',
  mustafa: '065F46',
  mohammed: '1D4ED8',
  ali: '6D28D9',
  yousef: '4B5563',
};

const speech = (speaker: PodcastSpeaker, text: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    bidirectional: true,
    spacing: { before: 100, after: 140, line: 400 },
    children: [
      run(`${PODCAST_SPEAKERS[speaker]}: `, { size: 26, bold: true, color: SPEAKER_DOCX_COLORS[speaker] }),
      run(text, { size: 26, italics: text === COMMENT_SLOT, color: text === COMMENT_SLOT ? '9CA3AF' : undefined }),
    ],
  });

// > قال تعالى:
// > {نص الآية}
// > [السورة: الآية]
function verseQuote(line: PodcastLine): Paragraph[] {
  const [intro, verse, ref] = verseBlockLines(line);
  const quote = (children: TextRun[], extra: { before?: number; after?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      indent: { right: 400 },
      spacing: { before: extra.before ?? 0, after: extra.after ?? 0, line: 380 },
      shading: { fill: 'FEF9E7', type: ShadingType.CLEAR },
      border: { right: { style: BorderStyle.SINGLE, size: 24, color: 'D4AF37', space: 8 } },
      children,
    });
  return [
    quote([run(intro, { size: 24, bold: true, color: '9A7B10' })], { before: 160 }),
    quote([run(verse, { size: 30, bold: true, color: line.unresolved || !line.text ? 'B91C1C' : '78350F' })]),
    quote([run(ref, { size: 22, color: '92400E' })], { after: 160 }),
  ];
}

const centered = (text: string, opts: Parameters<typeof run>[1], after = 80) =>
  new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, spacing: { after }, children: [run(text, opts)] });

const heading = (title: string) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    bidirectional: true,
    spacing: { before: 240, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4AF37', space: 4 } },
    children: [run(title, { size: 28, bold: true, color: '9A7B10' })],
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// «المحور الأول: الطهارة (٢/٣)» and «المحور الأول: الطهارة (٣/٣)» share an axis
const axisOf = (title: string) => title.replace(/\s*\([^)]*\)$/, '');

export async function exportPodcastToWord(script: PodcastScript) {
  const { episode } = script;
  const lead = episode.leadHost ?? DEFAULT_LEAD_HOST;
  const children: Paragraph[] = [
    // Cover page
    centered(episode.programName, { size: 44, bold: true, color: '9A7B10' }, 120),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `EPISODE ${episode.episodeNumber}`, font: 'Dosis', size: 30, bold: true, color: '1F2937' })],
    }),
    centered(episode.dateText, { size: 22, color: '4B5563' }),
    centered(`عن مقال: ${script.source.title}`, { size: 20, italics: true, color: '6B7280' }),
    centered(
      `قائد الحلقة: ${PODCAST_SPEAKERS[lead]} — الضيف: ${PODCAST_SPEAKERS.rasheed}${episode.coGuest ? ` و${PODCAST_SPEAKERS.ali}` : ''}`,
      { size: 20, color: '6B7280' },
      400
    ),
    heading('إخلاء المسؤولية المنهجي'),
    speech(lead, PODCAST_DISCLAIMER),
  ];

  let previousAxis = '';
  for (const segment of script.segments) {
    if (!segment.lines.length) continue;
    const axis = axisOf(segment.title);
    // A new page for each part of the episode (introduction, each axis, closing)
    if (axis !== previousAxis) children.push(pageBreak(), heading(segment.title));
    else children.push(heading(segment.title));
    previousAxis = axis;
    for (const line of segment.lines) {
      if (line.type === 'verse') children.push(...verseQuote(line));
      else if (line.speaker && line.text.trim()) children.push(speech(line.speaker, line.text));
    }
  }

  if (script.interruptionBank?.length) {
    children.push(
      pageBreak(),
      heading('بنك المقاطعات'),
      centered('أسئلة مقاطعة بديلة يستعين بها مخرج الصوت في المونتاج', { size: 20, italics: true, color: '6B7280' }, 200),
      ...script.interruptionBank.map((q, i) =>
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 140, line: 380 },
          children: [run(`${i + 1}. `, { size: 24, bold: true, color: '9A7B10' }), run(q, { size: 24 })],
        })
      )
    );
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
