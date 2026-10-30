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
  FootnoteReferenceRun,
} from 'docx';
import { saveAs } from 'file-saver';
import { IdeaNode, ProjectSettings } from '../types';
import { loadBlogCorpus } from '../data/blogLoader';
import { findRefArticle, formatBlogCitation } from './blogLinks';

export async function exportToWord(treeData: IdeaNode, settings: ProjectSettings) {
  const docParagraphs: (Paragraph | Table)[] = [];

  // Blog citations become Word footnotes. Article titles come from the corpus;
  // without it (no blog.json) the citation falls back to "المقال N".
  const blogArticles = (await loadBlogCorpus().catch(() => null))?.articles ?? [];
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  let nextFootnoteId = 1;

  function blogFootnoteRuns(node: IdeaNode): FootnoteReferenceRun[] {
    return (node.blogRefs ?? []).map(ref => {
      const id = nextFootnoteId++;
      footnotes[id] = {
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            children: [
              new TextRun({
                text: formatBlogCitation(ref, findRefArticle(blogArticles, ref)),
                size: 18, // 9pt
                font: 'Amiri',
                rightToLeft: true,
              }),
            ],
          }),
        ],
      };
      return new FootnoteReferenceRun(id);
    });
  }

  // Title
  docParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: settings.title,
          size: 44, // 22pt (in half-points)
          bold: true,
          font: 'Amiri',
          rightToLeft: true,
          color: '1E3A8A',
        }),
      ],
    })
  );

  // Subtitle / Description
  if (settings.subtitle) {
    docParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [
          new TextRun({
            text: settings.subtitle,
            size: 26, // 13pt
            italics: true,
            font: 'Amiri',
            rightToLeft: true,
            color: '4B5563',
          }),
        ],
      })
    );
  }

  // Metadata Box (Author, Date, Reference)
  docParagraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 300 },
      children: [
        new TextRun({
          text: `إعداد: ${settings.author} | التاريخ: ${settings.date}`,
          size: 20, // 10pt
          font: 'Amiri',
          rightToLeft: true,
          color: '6B7280',
        }),
      ],
    })
  );

  // Divider Line
  docParagraphs.push(
    new Paragraph({
      spacing: { before: 100, after: 300 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: '93C5FD',
        },
      },
    })
  );

  // Helper function to recursively traverse only included nodes
  function traverseNode(node: IdeaNode, depth: number) {
    if (!node.includeInDoc) return;

    // Footnote markers go after the node's heading (or its notes, for the project root)
    const refRuns = blogFootnoteRuns(node);

    // Skip root heading if already added as document title, but include notes
    if (node.type !== 'project') {
      if (node.type === 'axis') {
        // Heading 1 (محور)
        docParagraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.RIGHT,
            spacing: { before: 360, after: 140 },
            children: [
              new TextRun({
                text: `■ ${node.arabicLabel}`,
                size: 32, // 16pt
                bold: true,
                font: 'Amiri',
                rightToLeft: true,
                color: '1E3A8A', // Dark Blue
              }),
              ...refRuns,
            ],
          })
        );
      } else if (node.type === 'idea') {
        // Heading 2 (فكرة فرعية)
        docParagraphs.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240, after: 100 },
            children: [
              new TextRun({
                text: `● ${node.arabicLabel}`,
                size: 26, // 13pt
                bold: true,
                font: 'Amiri',
                rightToLeft: true,
                color: '374151', // Dark Gray
              }),
              ...refRuns,
            ],
          })
        );
      } else if (node.type === 'evidence') {
        // Evidence / شاهد
        docParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 180, after: 80 },
            children: [
              new TextRun({
                text: `📖 الشاهد القرآني: ${node.arabicLabel}`,
                size: 24, // 12pt
                bold: true,
                font: 'Amiri',
                rightToLeft: true,
                color: '854D0E', // Golden Amber
              }),
              ...refRuns,
            ],
          })
        );
      } else if (node.type === 'question') {
        // Question
        docParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 180, after: 80 },
            children: [
              new TextRun({
                text: `❓ مسألة بحثية: ${node.arabicLabel}`,
                size: 24, // 12pt
                bold: true,
                font: 'Amiri',
                rightToLeft: true,
                color: '0369A1', // Cyan Blue
              }),
              ...refRuns,
            ],
          })
        );
      }
    }

    // Quranic Verses Styled Table / Box
    if (node.quranicVerses && node.quranicVerses.trim()) {
      const verseBox = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: 'FEF9C3', type: ShadingType.CLEAR }, // Light gold
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' },
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: 'EAB308' },
                  left: { style: BorderStyle.SINGLE, size: 14, color: 'CA8A04' },
                  right: { style: BorderStyle.SINGLE, size: 14, color: 'CA8A04' },
                },
                margins: { top: 140, bottom: 140, left: 200, right: 200 },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({
                        text: node.quranicVerses.trim(),
                        size: 28, // 14pt
                        font: 'Amiri',
                        bold: true,
                        rightToLeft: true,
                        color: '78350F',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      docParagraphs.push(verseBox);
    }

    // Body Notes / Commentary
    const rootRefRuns = node.type === 'project' ? refRuns : [];
    if ((node.notes && node.notes.trim()) || rootRefRuns.length > 0) {
      docParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 100, after: 120, line: 360 }, // line height 1.8
          children: [
            new TextRun({
              text: (node.notes || '').trim(),
              size: 24, // 12pt
              font: 'Amiri',
              rightToLeft: true,
              color: '1F2937',
            }),
            ...rootRefRuns,
          ],
        })
      );
    }

    // Cross-References & Speakers Metadata (Footnote-like or info block)
    // Cross-References, Linked Ideas & Speakers Metadata
    const metadataParts: string[] = [];
    if (node.speakers && node.speakers.length > 0) {
      metadataParts.push(`المتحدث: ${node.speakers.join('، ')}`);
    }
    if (node.crossReferences && node.crossReferences.length > 0) {
      metadataParts.push(`الشواهد: [${node.crossReferences.join(' | ')}]`);
    }
    if (node.sessionRef) {
      metadataParts.push(`المرجع: ${node.sessionRef}`);
    }

    // Linked Ideas cross-references
    if (node.linkedIdeas && node.linkedIdeas.length > 0) {
      const linkStrings = node.linkedIdeas.map(l => {
        // Find target title
        let targetTitle = l.targetId;
        function findT(n: IdeaNode) {
          if (n.id === l.targetId) targetTitle = n.arabicLabel;
          if (n.children) n.children.forEach(findT);
        }
        findT(treeData);

        const relArabic = 
          l.type === 'supports' ? 'يدعم' :
          l.type === 'contradicts' ? 'يناقض' :
          l.type === 'extends' ? 'يوسع' : 'مقدمة لـ';

        return `${relArabic}: "${targetTitle}"`;
      });
      metadataParts.push(`🔗 إحالات وتشابكات: (${linkStrings.join(' • ')})`);
    }

    if (metadataParts.length > 0 && node.type !== 'project') {
      docParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 40, after: 140 },
          children: [
            new TextRun({
              text: `[ ${metadataParts.join(' | ')} ]`,
              size: 18, // 9pt
              font: 'Amiri',
              rightToLeft: true,
              color: '4B5563',
              italics: true,
            }),
          ],
        })
      );
    }

    // Recurse into children
    if (node.children) {
      node.children.forEach(child => traverseNode(child, depth + 1));
    }
  }

  traverseNode(treeData, 0);

  // Build Word Document
  const doc = new Document({
    footnotes,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906, // A4 width (210mm in DXA)
              height: 16838, // A4 height (297mm in DXA)
            },
            margin: {
              top: 1440, // 2.54cm = 1 inch = 1440 DXA
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: `${settings.title} — دراسة تأصيلية استقرائية`,
                    size: 18,
                    font: 'Amiri',
                    color: '9CA3AF',
                    rightToLeft: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'صفحة ',
                    size: 18,
                    font: 'Amiri',
                    color: '6B7280',
                    rightToLeft: true,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 18,
                    font: 'Amiri',
                    color: '6B7280',
                  }),
                  new TextRun({
                    text: ` — ${settings.date}`,
                    size: 18,
                    font: 'Amiri',
                    color: '6B7280',
                    rightToLeft: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children: docParagraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanName = settings.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  saveAs(blob, `${cleanName || 'Idea_Builder_Research'}.docx`);
}
