import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  PageNumber,
  Header,
  Footer,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { GeneratedArticle, DraftBlock } from '../types/article';

// Word export of a generated article draft: flowing prose with headings and
// verse boxes (the tree export in docxExport.ts stays as it is).

export const AI_DRAFT_LABEL = 'مسودة بمساعدة الذكاء الاصطناعي';
const QURAN_ATTRIBUTION = 'نص الآيات الكريمة من مشروع تنزيل — tanzil.net';

const FONT = 'Amiri';

const run = (text: string, opts: Partial<{ size: number; bold: boolean; italics: boolean; color: string }> = {}) =>
  new TextRun({ text, font: FONT, rightToLeft: true, size: opts.size ?? 24, bold: opts.bold, italics: opts.italics, color: opts.color ?? '1F2937' });

const prose = (text: string) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    bidirectional: true,
    spacing: { before: 80, after: 120, line: 400 }, // ~1.8 line height at 12pt
    children: [run(text)],
  });

// Same gold box as the tree export's Quranic verses
function verseBox(block: DraftBlock): Table | Paragraph {
  if (block.unresolved || !block.text) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      children: [run(`[تعذر العثور على الآية: ${block.ref ?? '—'}]`, { color: 'B91C1C', italics: true })],
    });
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: 'FEF9C3', type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' },
              left: { style: BorderStyle.SINGLE, size: 14, color: 'CA8A04' },
              right: { style: BorderStyle.SINGLE, size: 14, color: 'CA8A04' },
            },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                bidirectional: true,
                children: [
                  run(`﴿${block.text}﴾`, { size: 28, bold: true, color: '78350F' }),
                  run(`  [${(block.ref ?? '').replace(':', ': ')}]`, { size: 20, color: '92400E' }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function blockToDocx(block: DraftBlock): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading':
      return [new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 360, after: 160 },
        children: [run(block.text, { size: 32, bold: true, color: '1E3A8A' })],
      })];
    case 'subheading':
      return [new Paragraph({
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 240, after: 100 },
        children: [run(block.text, { size: 26, bold: true, color: '374151' })],
      })];
    case 'verse':
      return [verseBox(block), new Paragraph({ spacing: { after: 80 }, children: [] })];
    default:
      return [prose(block.text)];
  }
}

export async function exportArticleToWord(article: GeneratedArticle, author: string) {
  const isDraft = !article.approvedAt;
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 120 },
      children: [run(article.title, { size: 40, bold: true, color: '1E3A8A' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 300 },
      children: [run(isDraft ? `${author} — ${AI_DRAFT_LABEL}` : author, { size: 20, italics: isDraft, color: isDraft ? 'B45309' : '6B7280' })],
    }),
    ...article.opening.split(/\n{2,}/).filter(Boolean).map(prose),
    ...article.sections.flatMap(s => s.blocks.flatMap(blockToDocx)),
    ...article.closing.split(/\n{2,}/).filter(Boolean).map(prose),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { before: 480 },
      children: [run(QURAN_ATTRIBUTION, { size: 16, color: '9CA3AF' })],
    }),
  ];

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [run(isDraft ? `${article.title} — ${AI_DRAFT_LABEL}` : article.title, { size: 16, color: '9CA3AF' })],
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
  const name = article.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50) || 'مقال';
  saveAs(blob, `${name}${isDraft ? ' (مسودة)' : ''}.docx`);
}
