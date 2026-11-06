import React, { useMemo, useState } from 'react';
import { useArticleStore, currentArticleInput, treeAxisIds } from '../../store/useArticleStore';
import { useIdeaStore } from '../../store/useIdeaStore';
import { useBlogStore } from '../../store/useBlogStore';
import { articleWordCount, sortByAxisOrder } from '../../utils/articleBuilder';
import { paragraphsFromDraft } from '../../utils/blogArticle';
import { exportArticleToWord, AI_DRAFT_LABEL } from '../../utils/articleDocxExport';
import { toArabicDigits } from '../../utils/arabic';
import { ArticleSectionInput, DraftBlock, DraftSection } from '../../types/article';
import {
  PenLine,
  RotateCw,
  ChevronsUp,
  ChevronsDown,
  Pencil,
  Lock,
  Unlock,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
  Plus,
} from 'lucide-react';

const LONGER = 1.3;
const SHORTER = 0.7;

const paragraphsOf = (text: string) => text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

function VerseBlock({ block }: { block: DraftBlock }) {
  if (block.unresolved || !block.text) {
    return (
      <div className="my-3 mx-2 p-3 border-2 border-dashed border-rose-300 bg-rose-50 rounded-lg text-center fs-13 text-rose-700 font-sans">
        ⚠ تعذر العثور على الآية: {block.ref ?? '—'}
      </div>
    );
  }
  return (
    <div
      title={`النص القرآني الموثّق (تنزيل) — ${block.ref}:\n${block.text}`}
      className="my-3 mx-2 p-3.5 bg-[#fef9c3]/90 border-y border-[#ca8a04]/40 border-r-4 border-r-[#ca8a04] rounded-lg shadow-xs text-center"
    >
      <p className="font-quran fs-18 text-[#78350f] font-bold leading-relaxed">﴿{block.text}﴾</p>
      <span className="fs-11 text-amber-800/70 font-sans">[{block.ref?.replace(':', ': ')}]</span>
    </div>
  );
}

function SectionBlocks({ section }: { section: DraftSection }) {
  return (
    <>
      {section.blocks.map((b, i) => {
        if (b.type === 'heading') {
          return (
            <div key={i} className="mt-2 mb-3 border-b border-blue-900/15 pb-1">
              <h2 className="fs-21 font-bold text-[#1e3a8a] leading-tight font-quran">{b.text}</h2>
            </div>
          );
        }
        if (b.type === 'subheading') {
          return <h3 key={i} className="mt-4 mb-2 fs-17 font-bold text-[#374151] font-quran">{b.text}</h3>;
        }
        if (b.type === 'verse') return <VerseBlock key={i} block={b} />;
        if (b.type === 'bullet') {
          return (
            <p key={i} className="fs-16 text-[#1f2937] leading-[1.9] font-quran my-1 pr-6 relative">
              <span className="absolute right-1 text-[#b8901f]">◆</span>
              {b.text}
            </p>
          );
        }
        return <p key={i} className="fs-16 text-[#1f2937] leading-[1.9] text-justify font-quran my-2">{b.text}</p>;
      })}
    </>
  );
}

function SectionToolbar({ section, index }: { section: DraftSection; index: number }) {
  const { sectionMeta, isGenerating, regenerateSection, lockSection, unlockSection } = useArticleStore();
  const meta = sectionMeta[section.id];
  const [showInstruction, setShowInstruction] = useState(false);
  const [instruction, setInstruction] = useState('');
  const locked = Boolean(meta?.locked);
  const busy = isGenerating || locked;

  const button = 'px-1.5 py-1 rounded flex items-center gap-1 fs-11 transition disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="no-print select-none -mx-2 mb-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg space-y-1.5 font-sans">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 fs-11.5">
          <span className="fs-10 font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 rounded-full">
            {toArabicDigits(index + 1)}
          </span>
          <span className="font-bold text-gray-700 truncate">{section.axisName}</span>
          <span className="text-gray-400 font-mono fs-10 flex-shrink-0">{toArabicDigits(section.wordCount)} كلمة</span>
          {meta?.generating && (
            <span className="flex items-center gap-1 text-blue-600 fs-10.5">
              <Loader2 className="w-3 h-3 animate-spin" /> جاري الكتابة...
            </span>
          )}
          {meta?.stale && !meta.generating && (
            <span className="fs-10.5 bg-amber-100 text-amber-800 border border-amber-300 px-1.5 rounded-full flex-shrink-0">
              ⚠️ يحتاج تحديث – انقر ⟳
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0 text-gray-600">
          <button type="button" disabled={busy} onClick={() => regenerateSection(section.id)} title="إعادة كتابة هذا المحور" className={`${button} hover:bg-white hover:text-blue-700`}>
            <RotateCw className="w-3.5 h-3.5" /> <span>إعادة</span>
          </button>
          <button type="button" disabled={busy} onClick={() => regenerateSection(section.id, { lengthFactor: LONGER })} title="أطول بنحو ٣٠٪" className={`${button} hover:bg-white hover:text-blue-700`}>
            <ChevronsUp className="w-3.5 h-3.5" /> <span>أطول</span>
          </button>
          <button type="button" disabled={busy} onClick={() => regenerateSection(section.id, { lengthFactor: SHORTER })} title="أقصر بنحو ٣٠٪" className={`${button} hover:bg-white hover:text-blue-700`}>
            <ChevronsDown className="w-3.5 h-3.5" /> <span>أقصر</span>
          </button>
          <button type="button" disabled={busy} onClick={() => setShowInstruction(!showInstruction)} title="تعليمات خاصة لهذا المحور" className={`${button} ${showInstruction ? 'bg-white text-blue-700' : 'hover:bg-white hover:text-blue-700'}`}>
            <Pencil className="w-3.5 h-3.5" /> <span>تعليمات</span>
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => (locked ? unlockSection(section.id) : lockSection(section.id))}
            title={locked ? 'إلغاء القفل' : 'قفل المحور لمنع استبداله'}
            className={`${button} ${locked ? 'bg-amber-100 text-amber-800' : 'hover:bg-white hover:text-amber-700'}`}
          >
            {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {showInstruction && !locked && (
        <div className="flex items-start gap-1.5">
          <textarea
            rows={2}
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="مثلاً: ركّز على دلالة السبيل في سورة العنكبوت"
            className="flex-1 bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 font-quran focus:outline-none focus:border-blue-400"
          />
          <button
            type="button"
            disabled={isGenerating || !instruction.trim()}
            onClick={() => {
              regenerateSection(section.id, { instruction: instruction.trim() });
              setShowInstruction(false);
            }}
            className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded text-xs font-semibold"
          >
            تطبيق
          </button>
        </div>
      )}

      {section.rejectedRefs && section.rejectedRefs.length > 0 && (
        <div className="fs-10.5 text-rose-700">
          ⚠ استُبعدت آيات خارج المراجع المسموح بها: {section.rejectedRefs.join('، ')}
        </div>
      )}
    </div>
  );
}

// An axis of the tree with no section in the draft yet, shown in its tree position
function MissingSection({ section }: { section: ArticleSectionInput }) {
  const { isGenerating, generateMissingSection } = useArticleStore();
  const ideas = section.nodes.filter(n => n.depth > 0).length;
  return (
    <div className="no-print select-none -mx-2 p-3 border-2 border-dashed border-gray-300 bg-gray-50/70 rounded-lg flex items-center justify-between gap-2 font-sans">
      <div className="min-w-0 fs-11.5">
        <span className="font-bold text-gray-700 font-quran">{section.axisName}</span>
        <span className="block fs-10.5 text-gray-500">
          محور في الشجرة لم يُكتب بعد ({toArabicDigits(ideas)} أفكار)
        </span>
      </div>
      <button
        type="button"
        disabled={isGenerating}
        onClick={() => generateMissingSection(section.id)}
        title="كتابة هذا المحور في موضعه من المقال"
        className="px-2.5 py-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded fs-11 font-semibold flex items-center gap-1 flex-shrink-0"
      >
        <Sparkles className="w-3.5 h-3.5" /> توليد
      </button>
    </div>
  );
}

type SectionRow =
  | { id: string; kind: 'draft'; section: DraftSection; index: number }
  | { id: string; kind: 'missing'; section: ArticleSectionInput };

export const ArticleDraftView: React.FC = () => {
  const {
    draft,
    sectionMeta,
    isGenerating,
    progress,
    error,
    regenerateSection,
    cancelGeneration,
    approveDraft,
    unapproveDraft,
    openGenerateModal,
    clearError,
  } = useArticleStore();
  const treeData = useIdeaStore(state => state.treeData);
  const author = useIdeaStore(state => state.projectSettings.author);
  const [isExporting, setIsExporting] = useState(false);
  const savedArticles = useBlogStore(state => state.savedArticles);
  const [storyMessage, setStoryMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // One story-corpus entry per generated draft (saving again updates it)
  const storyId = draft ? `story-${draft.generatedAt}` : '';
  const savedEntry = savedArticles.find(a => a.id === storyId);

  // Coverage: which included ideas of the current tree the draft treats
  const coverage = useMemo(() => {
    if (!draft) return null;
    const input = currentArticleInput(draft.options);
    const inDraft = new Set(draft.sections.map(s => s.id));
    const covered = new Set(draft.sections.flatMap(s => s.coveredNodeIds));
    const ideas = input.sections
      .filter(s => inDraft.has(s.id))
      .flatMap(s => s.nodes.filter(n => n.depth > 0).map(n => ({ ...n, sectionId: s.id })));
    return {
      total: ideas.length,
      covered: ideas.filter(n => covered.has(n.id)).length,
      uncovered: ideas.filter(n => !covered.has(n.id)),
      newAxes: input.sections.filter(s => !inDraft.has(s.id)).map(s => s.axisName),
    };
  }, [draft, treeData]);

  // The draft's sections plus the tree's not-yet-written axes, in the tree's axis
  // order (the store keeps draft.sections in that order)
  const rows = useMemo<SectionRow[]>(() => {
    if (!draft) return [];
    const inDraft = new Set(draft.sections.map(s => s.id));
    const missing = currentArticleInput(draft.options).sections.filter(s => !inDraft.has(s.id));
    return sortByAxisOrder<SectionRow>([
      ...draft.sections.map((section, index) => ({ id: section.id, kind: 'draft' as const, section, index })),
      ...missing.map(section => ({ id: section.id, kind: 'missing' as const, section })),
    ], treeAxisIds());
  }, [draft, treeData]);

  const handleExport = async () => {
    if (!draft) return;
    try {
      setIsExporting(true);
      await exportArticleToWord(draft, author);
    } finally {
      setIsExporting(false);
    }
  };

  // The approved article joins the story corpus (this browser): later parts
  // retrieve passages from it and recap it in their opening
  const handleSaveToStory = async () => {
    if (!draft?.approvedAt) return;
    const blog = useBlogStore.getState();
    await blog.loadCorpus();
    const ok = blog.saveToStory({
      id: storyId,
      partNumber: savedEntry?.partNumber ?? blog.nextPartNumber(),
      title: draft.title,
      paragraphs: paragraphsFromDraft(draft),
    });
    setStoryMessage(ok
      ? { ok: true, text: 'تمت إضافة المقال لقاعدة القصة. سيُستخدم كمرجع في الأجزاء القادمة.' }
      : { ok: false, text: 'تعذر الحفظ: مساحة التخزين في المتصفح ممتلئة أو محظورة.' });
  };

  const percent = progress ? Math.round((progress.step / Math.max(1, progress.total)) * 100) : 0;
  const isDraftLabelled = draft && !draft.approvedAt;

  return (
    <div className="h-full flex flex-col bg-[#e5e7eb] select-text">
      {/* Toolbar */}
      <div className="h-11 bg-white border-b border-gray-300 px-4 flex items-center justify-between gap-3 shadow-xs no-print select-none flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <PenLine className="w-4 h-4 text-blue-700 flex-shrink-0" />
          <span className="font-bold text-sm text-blue-900 truncate">مسودة المقال</span>
          {draft && (
            isDraftLabelled ? (
              <span className="fs-10.5 bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                <Sparkles className="w-3 h-3" /> {AI_DRAFT_LABEL}
              </span>
            ) : (
              <span className="fs-10.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0">
                <CheckCircle2 className="w-3 h-3" /> معتمدة
              </span>
            )
          )}
          {draft && <span className="hidden xl:inline fs-11 text-gray-400 font-mono">{toArabicDigits(articleWordCount(draft))} كلمة</span>}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {draft && (
            <button
              type="button"
              disabled={isGenerating}
              onClick={isDraftLabelled ? approveDraft : unapproveDraft}
              title={isDraftLabelled ? 'اعتماد المسودة بعد مراجعتها' : 'إعادتها مسودة'}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded shadow-xs disabled:opacity-40 transition"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isDraftLabelled ? 'اعتماد' : 'إلغاء الاعتماد'}</span>
            </button>
          )}
          {draft?.approvedAt && (
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleSaveToStory}
              title={savedEntry
                ? `محفوظ في قاعدة القصة جزءاً ${savedEntry.partNumber} — انقر لتحديثه`
                : 'إضافة المقال المعتمد إلى قاعدة القصة ليكون مرجعاً للأجزاء القادمة'}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded shadow-xs disabled:opacity-40 transition"
            >
              <span>{savedEntry ? `💾 تحديث في قاعدة القصة (${toArabicDigits(savedEntry.partNumber)})` : '💾 حفظ في قاعدة القصة'}</span>
            </button>
          )}
          <button
            type="button"
            disabled={isGenerating}
            onClick={openGenerateModal}
            title="كتابة المقال من الشجرة الحالية"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded shadow-xs disabled:opacity-40 transition"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>{draft ? 'إعادة كتابة المقال' : 'كتابة المقال'}</span>
          </button>
          {draft && (
            <button
              type="button"
              disabled={isGenerating || isExporting}
              onClick={handleExport}
              title="تصدير المسودة كملف Word بتنسيق نثري"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-xs disabled:opacity-50 transition"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExporting ? 'جاري التصدير...' : '📤 تصدير كـ Word'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {isGenerating && progress && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-200 no-print select-none flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-blue-900 mb-1">
            <span className="flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{progress.label}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="font-mono fs-11">{toArabicDigits(percent)}٪</span>
              <button type="button" onClick={cancelGeneration} className="fs-11 text-rose-700 hover:underline">إلغاء</button>
            </span>
          </div>
          <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {storyMessage && (
        <div role="status" className={`px-4 py-2 border-b text-xs flex items-center justify-between no-print select-none flex-shrink-0 ${storyMessage.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          <span>{storyMessage.ok ? '✅ ' : '⚠️ '}{storyMessage.text}</span>
          <button type="button" onClick={() => setStoryMessage(null)} title="إخفاء" className="opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-800 flex items-center justify-between no-print select-none flex-shrink-0">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>تعذرت الكتابة: {error}</span>
          </span>
          <button type="button" onClick={clearError} title="إخفاء" className="text-rose-500 hover:text-rose-800">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Page */}
      <div className="flex-1 overflow-auto word-scrollbar scroll-smooth p-6 lg:p-10 flex flex-col items-center">
        {!draft ? (
          <div className="mt-16 bg-white rounded-lg shadow-md ring-1 ring-black/5 p-8 max-w-sm text-center space-y-3 no-print">
            {isGenerating ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-700 mx-auto animate-spin" />
                <p className="text-sm text-gray-600">{progress?.label ?? 'جاري الكتابة...'}</p>
              </>
            ) : (
              <>
                <PenLine className="w-8 h-8 text-blue-700 mx-auto" />
                <p className="text-sm text-gray-600 leading-relaxed">لم يتم إنشاء مسودة بعد. اضغط ✍️ كتابة المقال للبدء.</p>
                <button
                  type="button"
                  onClick={openGenerateModal}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-xs"
                >
                  ✍️ كتابة المقال
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <article className="relative bg-white shadow-2xl ring-1 ring-black/10 rounded-xs a4-page-print flex-shrink-0 w-full max-w-[794px] min-h-[1123px] px-12 py-14 lg:p-[96px] text-right text-gray-900 mb-6">
              <div className="border-b border-gray-200 pb-2 mb-8 flex items-center justify-between fs-11 text-gray-400 font-quran">
                <span>{draft.title}</span>
                {isDraftLabelled && <span className="text-amber-600 font-sans">{AI_DRAFT_LABEL}</span>}
              </div>

              <h1 className="fs-26 font-bold text-[#1e3a8a] font-quran text-center mb-8">{draft.title}</h1>

              {paragraphsOf(draft.opening).map((p, i) => (
                <p key={`o${i}`} className="fs-16 text-[#1f2937] leading-[1.9] text-justify font-quran my-2">{p}</p>
              ))}

              {rows.map(row => row.kind === 'draft' ? (
                <section key={row.id} data-section-id={row.id} className={`mt-8 transition-opacity ${sectionMeta[row.id]?.generating ? 'opacity-50' : ''}`}>
                  <SectionToolbar section={row.section} index={row.index} />
                  <SectionBlocks section={row.section} />
                </section>
              ) : (
                <section key={row.id} data-section-id={row.id} className="mt-8">
                  <MissingSection section={row.section} />
                </section>
              ))}

              <div className="mt-8">
                {paragraphsOf(draft.closing).map((p, i) => (
                  <p key={`c${i}`} className="fs-16 text-[#1f2937] leading-[1.9] text-justify font-quran my-2">{p}</p>
                ))}
              </div>

              <div className="mt-16 pt-4 border-t border-gray-200 flex items-center justify-between fs-10.5 text-gray-400 font-sans">
                <span>
                  نص الآيات الكريمة من{' '}
                  <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">مشروع تنزيل (tanzil.net)</a>
                </span>
                <span>{isDraftLabelled ? AI_DRAFT_LABEL : 'معتمدة'}</span>
              </div>
            </article>

            {/* Coverage report */}
            {coverage && (
              <div className="flex-shrink-0 w-full max-w-[794px] mb-12 bg-white rounded-lg shadow ring-1 ring-black/5 p-4 text-xs text-gray-700 no-print select-none space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-800">
                    الأفكار المغطاة: {toArabicDigits(coverage.covered)} من {toArabicDigits(coverage.total)}
                  </span>
                  <div className="w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${coverage.total ? (coverage.covered / coverage.total) * 100 : 0}%` }} />
                  </div>
                </div>
                {coverage.uncovered.length > 0 && (
                  <div className="space-y-1">
                    <span className="fs-11 text-gray-500 block">أفكار لم يتناولها المقال بعد:</span>
                    {coverage.uncovered.map(n => {
                      const locked = sectionMeta[n.sectionId]?.locked;
                      return (
                        <div key={n.id} className="flex items-center justify-between gap-2 p-1.5 bg-gray-50 border border-gray-200 rounded">
                          <span className="font-quran truncate">💡 {n.label}</span>
                          <button
                            type="button"
                            disabled={isGenerating || locked}
                            onClick={() => regenerateSection(n.sectionId, { instruction: `أدرج في هذا المحور الفكرة «${n.label}» (المعرف ${n.id}) وتناولها بوضوح، دون إسقاط ما سواها.` })}
                            title={locked ? 'محورها مقفل' : 'إعادة كتابة محورها مع هذه الفكرة'}
                            className="px-2 py-0.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white rounded fs-10.5 flex items-center gap-1 flex-shrink-0"
                          >
                            <Plus className="w-3 h-3" /> إضافة للمقال
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {coverage.newAxes.length > 0 && (
                  <div className="fs-11 text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                    محاور جديدة في الشجرة ليست في المسودة: {coverage.newAxes.join('، ')} — اضغط «توليد» في موضعها من المقال لكتابتها.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
