import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBlogStore } from '../../store/useBlogStore';
import { useIdeaStore, findNodeById } from '../../store/useIdeaStore';
import { toArabicDigits, paragraphNumber, extractVerses } from '../../utils/arabic';
import { makeQuote, formatVerseForTree } from '../../utils/blogLinks';
import { BlogParagraph, BlogVerse } from '../../types/blog';
import {
  ArrowRight,
  BookOpen,
  BookMarked,
  ListTree,
  Loader2,
  FileText,
  Lightbulb,
} from 'lucide-react';

const EVIDENCE_LABEL_LENGTH = 40;
const TOAST_DURATION_MS = 2500;

interface SelectionAction {
  x: number;
  top: number;
  bottom: number;
  text: string;
  paragraphId: string;
}

// ﴿…﴾ in either bracket order. A match is only wrapped when it doesn't cut
// through an inline tag (e.g. a verse that starts inside <strong> and ends outside).
const VERSE_HTML_RE = /[﴾﴿][^﴾﴿]*?[﴾﴿]/g;
const OPEN_TAG_RE = /<(?!\/|br\b|img\b|hr\b)[a-z]/gi;
const CLOSE_TAG_RE = /<\//g;

function decorateVerses(html: string): string {
  return html.replace(VERSE_HTML_RE, match => {
    const opens = match.match(OPEN_TAG_RE)?.length ?? 0;
    const closes = match.match(CLOSE_TAG_RE)?.length ?? 0;
    return opens === closes ? `<span class="blog-verse">${match}</span>` : match;
  });
}

function verseLabel(verse: BlogVerse): string {
  if (!verse.surah || verse.ayahFrom === undefined) return 'آية بلا مرجع';
  const range = verse.ayahTo !== undefined && verse.ayahTo !== verse.ayahFrom
    ? `${verse.ayahFrom}-${verse.ayahTo}`
    : `${verse.ayahFrom}`;
  return `${verse.surah}: ${range}`;
}

const VERSE_PREVIEW_WORDS = 5;

export const BlogReader: React.FC = () => {
  const {
    corpus,
    isLoading,
    openArticleId,
    highlightedParagraphId,
    scrollTargetId,
    loadCorpus,
    highlightParagraph,
    clearScrollTarget,
    setLeftPanelView,
  } = useBlogStore();
  const setActiveMiddleTab = useIdeaStore(state => state.setActiveMiddleTab);
  const selectedNodeLabel = useIdeaStore(state => {
    const node = findNodeById(state.treeData, state.selectedNodeId);
    return node && node.type !== 'project' ? node.arabicLabel : null;
  });

  const [showHeadings, setShowHeadings] = useState(true);
  const [showVerses, setShowVerses] = useState(false);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, kind: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    loadCorpus();
  }, [loadCorpus]);

  const article = corpus?.articles.find(a => a.id === openArticleId) ?? null;
  const headings = useMemo(() => article?.paragraphs.filter(p => p.isHeading) ?? [], [article]);
  const decoratedHtml = useMemo(
    () => new Map(article?.paragraphs.map(p => [p.id, p.isHeading ? p.html : decorateVerses(p.html)])),
    [article]
  );

  const scrollToParagraph = (id: string) => {
    scrollRef.current
      ?.querySelector(`[data-pid="${id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // A newly opened article starts at the top...
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    setSelectionAction(null);
  }, [article?.id]);

  // ...unless a specific paragraph was requested (search "اذهب", verse sidebar).
  // Waits for the article to be rendered, then consumes the request.
  useEffect(() => {
    if (!article || !scrollTargetId) return;
    scrollToParagraph(scrollTargetId);
    clearScrollTarget();
  }, [scrollTargetId, article, clearScrollTarget]);

  // ---- "Add as evidence" from a text selection ----------------------------

  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? '';
    if (!selection || selection.isCollapsed || !text || !articleRef.current) {
      setSelectionAction(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!articleRef.current.contains(range.commonAncestorContainer)) {
      setSelectionAction(null);
      return;
    }
    // A selection spanning several paragraphs is attributed to the first one.
    const startNode = range.startContainer;
    const startElement = startNode instanceof Element ? startNode : startNode.parentElement;
    const paragraphId = startElement?.closest('[data-pid]')?.getAttribute('data-pid');
    if (!paragraphId) {
      setSelectionAction(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    setSelectionAction({ x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom, text, paragraphId });
  };

  const handleAddEvidence = () => {
    if (!selectionAction || !article) return;
    const { treeData, selectedNodeId, addChildNode, updateNode, selectNode, pulseNode } = useIdeaStore.getState();
    const parent = findNodeById(treeData, selectedNodeId);
    if (!parent || parent.type === 'project') {
      showToast('اختر نوداً في الشجرة أولاً', 'error');
      return;
    }

    const text = selectionAction.text.replace(/\s+/g, ' ').trim();
    const label = text.length > EVIDENCE_LABEL_LENGTH ? `${text.slice(0, EVIDENCE_LABEL_LENGTH).trim()}…` : text;
    const verses = extractVerses(text, selectionAction.paragraphId, article.partNumber);

    const newId = addChildNode(parent.id, 'evidence');
    updateNode(newId, {
      name: `Blog evidence (Part ${article.partNumber})`,
      arabicLabel: label,
      source: 'rasheed_article',
      sessionRef: `مقالات د. رشيد — الجزء ${toArabicDigits(article.partNumber)}`,
      notes: text,
      quranicVerses: verses.map(formatVerseForTree).join('\n'),
      blogRefs: [{ partNumber: article.partNumber, paragraphId: selectionAction.paragraphId, quote: makeQuote(text) }],
    });
    // Keep the parent selected so several passages can be added in a row.
    selectNode(parent.id);
    pulseNode(newId);

    window.getSelection()?.removeAllRanges();
    setSelectionAction(null);
    showToast(`أُضيف شاهد تحت: ${parent.arabicLabel}`, 'success');
  };

  const renderParagraph = (p: BlogParagraph) => {
    const isHighlighted = p.id === highlightedParagraphId;
    const level = p.headingLevel ?? 1;

    return (
      <div
        key={p.id}
        data-pid={p.id}
        className={`group relative rounded px-2 -mx-2 border-l-4 transition-colors duration-300 ${
          isHighlighted ? 'bg-[#fef08a]/70 border-[#89b4fa]' : 'border-transparent'
        }`}
      >
        {/* Paragraph number (hover) */}
        <span className="absolute -right-9 top-1.5 w-6 text-center text-[10px] font-mono text-gray-400 opacity-0 group-hover:opacity-100 transition select-none no-print">
          {toArabicDigits(paragraphNumber(p.id))}
        </span>

        {p.isHeading && level === 1 && (
          <div className="mt-6 mb-2 border-b border-blue-900/15 pb-1">
            <h2 className="text-[21px] font-bold text-[#1e3a8a] leading-tight font-quran">{p.text}</h2>
          </div>
        )}
        {p.isHeading && level === 2 && (
          <h3 className="mt-4 mb-2 text-[17px] font-bold text-[#374151] leading-snug font-quran flex items-center gap-2">
            <span className="text-amber-600 text-xs font-mono">●</span>
            <span>{p.text}</span>
          </h3>
        )}
        {p.isHeading && level > 2 && (
          <h4 className="mt-3 mb-1 text-[15px] font-bold text-[#4b5563] font-quran">{p.text}</h4>
        )}
        {!p.isHeading && (
          <div
            className="blog-content font-quran text-[16px] text-[#1f2937] leading-[1.8] text-justify py-0.5"
            dangerouslySetInnerHTML={{ __html: decoratedHtml.get(p.id) ?? p.html }}
          />
        )}
      </div>
    );
  };

  // ---- Empty / loading states -------------------------------------------

  const renderPlaceholder = () => (
    <div className="flex-1 flex items-center justify-center p-6">
      {!corpus && isLoading ? (
        <div className="flex flex-col items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
          <span>جاري تحميل المقالات...</span>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md ring-1 ring-black/5 p-8 max-w-sm text-center space-y-3">
          <BookOpen className="w-8 h-8 text-blue-700 mx-auto" />
          <h3 className="text-base font-bold text-gray-800">لم يتم فتح أي مقال بعد</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            اختر مقالاً من تبويب «المقالات» في العمود الأوسط لقراءته هنا.
          </p>
          <button
            type="button"
            onClick={() => setActiveMiddleTab('blog')}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-xs active:scale-95 transition"
          >
            فتح تبويب المقالات
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#e5e7eb] select-text">
      {/* Header Bar */}
      <div className="h-11 bg-white border-b border-gray-300 px-4 flex items-center justify-between gap-3 shadow-xs no-print select-none flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setLeftPanelView('document')}
            title="العودة إلى معاينة المستند"
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded shadow-xs active:scale-95 transition flex-shrink-0"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>العودة للمستند</span>
          </button>

          {article && (
            <>
              <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full flex-shrink-0">
                الجزء {toArabicDigits(article.partNumber)}
              </span>
              <span className="text-sm font-bold text-blue-900 truncate font-quran" title={article.title}>
                {article.title}
              </span>
              <span className="hidden xl:flex items-center gap-1 text-[10.5px] text-gray-400 truncate flex-shrink min-w-0" title={article.sourceFile}>
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{article.sourceFile}</span>
              </span>
            </>
          )}
        </div>

        {article && (
          <div className="flex items-center gap-1 bg-gray-100 px-1 py-0.5 rounded-md border border-gray-200 text-xs text-gray-700 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowHeadings(!showHeadings)}
              title="فهرس العناوين"
              className={`p-1 rounded transition flex items-center gap-1 ${showHeadings ? 'bg-white text-blue-700 shadow-xs' : 'hover:bg-white text-gray-600'}`}
            >
              <ListTree className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowVerses(!showVerses)}
              title="الآيات الواردة في المقال"
              className={`px-1.5 py-1 rounded transition flex items-center gap-1 ${showVerses ? 'bg-white text-amber-700 shadow-xs' : 'hover:bg-white text-gray-600'}`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              <span className="font-mono text-[10.5px]">{toArabicDigits(article.verses.length)}</span>
            </button>
          </div>
        )}
      </div>

      {!article ? renderPlaceholder() : (
        <div className="flex-1 flex overflow-hidden">
          {/* Headings navigation (right side in RTL) */}
          {showHeadings && headings.length > 0 && (
            <nav className="w-44 flex-shrink-0 bg-[#f3f4f6] border-l border-gray-300 overflow-auto word-scrollbar py-2 no-print select-none">
              <div className="px-3 pb-1.5 text-[10.5px] font-bold text-gray-500">العناوين</div>
              {headings.map(h => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => scrollToParagraph(h.id)}
                  title={h.text}
                  className="w-full text-right py-1 pl-2 text-[11.5px] text-gray-700 hover:text-blue-700 hover:bg-white truncate transition font-quran"
                  style={{ paddingRight: `${0.75 + ((h.headingLevel ?? 1) - 1) * 0.6}rem` }}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}

          {/* Scrollable A4 article */}
          <div
            ref={scrollRef}
            onMouseUp={handleMouseUp}
            onMouseDown={() => setSelectionAction(null)}
            onScroll={() => selectionAction && setSelectionAction(null)}
            className="flex-1 overflow-auto word-scrollbar scroll-smooth p-6 lg:p-10 flex flex-col items-center"
          >
            <article ref={articleRef} className="relative bg-white shadow-2xl ring-1 ring-black/10 rounded-xs a4-page-print w-full max-w-[794px] min-h-[1123px] px-12 py-14 lg:p-[96px] text-right text-gray-900 mb-12">
              {/* Running Header */}
              <div className="border-b border-gray-200 pb-2 mb-8 flex items-center justify-between text-[11px] text-gray-400 font-quran">
                <span>مقالات د. رشيد الجراح — قصة لوط</span>
                <span>الجزء {toArabicDigits(article.partNumber)}</span>
              </div>

              <div className="space-y-1">
                {article.paragraphs.map(renderParagraph)}
              </div>

              {/* Running Footer */}
              <div className="mt-16 pt-4 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-400 font-sans">
                <span>{article.sourceFile}</span>
                <span className="font-mono">
                  {toArabicDigits(article.wordCount)} كلمة • {toArabicDigits(article.verses.length)} آية
                </span>
              </div>
            </article>
          </div>

          {/* Verse sidebar (left side in RTL) */}
          {showVerses && (
            <aside className="w-56 flex-shrink-0 bg-[#fffbeb] border-r border-amber-200 overflow-auto word-scrollbar no-print select-none">
              <div className="px-3 py-2 text-[11px] font-bold text-amber-900 border-b border-amber-200 flex items-center gap-1.5">
                <BookMarked className="w-3.5 h-3.5" />
                <span>آيات المقال ({toArabicDigits(article.verses.length)})</span>
              </div>
              {article.verses.length === 0 ? (
                <div className="p-3 text-[11px] text-amber-800/70">لا توجد آيات في هذا المقال.</div>
              ) : (
                article.verses.map((v, i) => (
                  <button
                    key={`${v.paragraphId}-${i}`}
                    type="button"
                    onClick={() => highlightParagraph(v.paragraphId)}
                    className={`w-full text-right px-3 py-1.5 border-b border-amber-100 hover:bg-amber-100/70 transition space-y-0.5 ${
                      v.paragraphId === highlightedParagraphId ? 'bg-amber-100' : ''
                    }`}
                  >
                    <div className="text-[11px] font-bold text-amber-900">📖 {verseLabel(v)}</div>
                    <div className="text-[12px] text-[#78350f] font-quran truncate">
                      {v.text.split(/\s+/).slice(0, VERSE_PREVIEW_WORDS).join(' ')}…
                    </div>
                  </button>
                ))
              )}
            </aside>
          )}
        </div>
      )}

      {/* Floating "add as evidence" action above (or below) the selection */}
      {selectionAction && (
        <div
          className="fixed z-50 no-print select-none"
          style={{
            left: selectionAction.x,
            top: selectionAction.top > 64 ? selectionAction.top - 8 : selectionAction.bottom + 8,
            transform: `translate(-50%, ${selectionAction.top > 64 ? '-100%' : '0'})`,
          }}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleAddEvidence}
            title={selectedNodeLabel ? `إضافة شاهد تحت: ${selectedNodeLabel}` : 'اختر فكرة في الشجرة أولاً'}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 bg-[#1e1e2e] hover:bg-[#313244] text-white rounded-lg shadow-xl ring-1 ring-[#89b4fa]/50 transition"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              <Lightbulb className="w-3.5 h-3.5 text-amber-300" />
              <span>أضف كشاهد في الشجرة</span>
            </span>
            {selectedNodeLabel && (
              <span className="text-[10px] text-gray-400 max-w-[220px] truncate">تحت: {selectedNodeLabel}</span>
            )}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 no-print select-none pointer-events-none">
          <div
            className={`px-4 py-2 rounded-lg shadow-xl text-xs font-semibold text-white ${
              toast.kind === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};
