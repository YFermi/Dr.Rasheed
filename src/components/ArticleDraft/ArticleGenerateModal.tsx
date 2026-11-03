import React, { useMemo, useState } from 'react';
import { useArticleStore, currentArticleInput } from '../../store/useArticleStore';
import { useBlogStore } from '../../store/useBlogStore';
import { useIdeaStore, getAllNodeList } from '../../store/useIdeaStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { useReferenceStore } from '../../store/useReferenceStore';
import { latestReferenceArticle } from '../../utils/referenceContext';
import { modelLabel } from '../../utils/apiKey';
import { hasEnoughContent, SECTION_LENGTHS, partCount, withOptionDefaults } from '../../utils/articleBuilder';
import { toArabicDigits } from '../../utils/arabic';
import { ArticleOptions } from '../../types/article';
import { PenLine, X, AlertTriangle, Lock } from 'lucide-react';

const formatWords = (n: number) => n.toLocaleString('ar-EG');

export const ArticleGenerateModal: React.FC = () => {
  const { isGenerateModalOpen, closeGenerateModal, generate, lastOptions, draft, sectionMeta, isGenerating } = useArticleStore();
  const treeData = useIdeaStore(state => state.treeData);
  const setLeftPanelView = useBlogStore(state => state.setLeftPanelView);
  const aiAvailable = useApiKeyStore(selectAiAvailable);
  const openKeyModal = useApiKeyStore(state => state.openModal);
  const model = useApiKeyStore(state => state.model);
  const { stories, referenceArticles, openModal: openReferenceModal } = useReferenceStore();
  // Options saved before the per-axis length existed get its default (3,000 words)
  const [options, setOptions] = useState<ArticleOptions>(() => withOptionDefaults(lastOptions));

  const input = useMemo(
    () => (isGenerateModalOpen ? currentArticleInput(options) : null),
    // treeData: re-read the tree when it changes while the modal is open
    [isGenerateModalOpen, options, treeData]
  );
  const deferredCount = useMemo(
    () => getAllNodeList(treeData).filter(n => n.status === 'deferred' && n.includeInDoc).length,
    [treeData]
  );

  if (!isGenerateModalOpen || !input) return null;

  const enough = hasEnoughContent(input);
  const ideaCount = input.sections.reduce((n, s) => n + s.nodes.filter(x => x.depth > 0).length, 0);
  const lockedCount = draft ? draft.sections.filter(s => sectionMeta[s.id]?.locked).length : 0;
  const reference = latestReferenceArticle(referenceArticles, options.storyName);
  const storyChoices = stories.includes(options.storyName) ? stories : [options.storyName, ...stories];

  const handleStart = () => {
    closeGenerateModal();
    setLeftPanelView('draft');
    generate(options);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none" onClick={closeGenerateModal}>
      <div
        className="w-full max-w-md bg-[#121212] border border-[#2e2817] rounded-xl shadow-2xl text-[#efe6cf] text-right"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-11 px-4 bg-[#0a0a0a] border-b border-[#2e2817] rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <PenLine className="w-4 h-4 text-amber-300" />
            <span>✍️ كتابة المقال</span>
          </div>
          <button type="button" onClick={closeGenerateModal} title="إغلاق" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          {/* What will be written */}
          <div className="p-3 bg-[#0a0a0a] border border-[#2e2817] rounded-lg space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-400">المحاور التي ستُكتب</span>
              <span className="font-mono text-white">{toArabicDigits(input.sections.length)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">الأفكار المدرجة</span>
              <span className="font-mono text-white">{toArabicDigits(ideaCount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">الآيات المسموح بالاستشهاد بها</span>
              <span className="font-mono text-amber-300">{toArabicDigits(input.allowedVerseRefs.length)}</span>
            </div>
            {input.sections.length > 0 && (
              <div className="pt-1.5 border-t border-[#2e2817] text-[10.5px] text-gray-400 leading-relaxed">
                {input.sections.map(s => s.axisName).join(' • ')}
              </div>
            )}
          </div>

          {!aiAvailable && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded text-amber-200 flex items-center justify-between gap-2">
              <span>🔑 يرجى إدخال مفتاح API أولاً</span>
              <button type="button" onClick={openKeyModal} className="text-[10.5px] underline hover:text-white flex-shrink-0">
                إدخال المفتاح
              </button>
            </div>
          )}

          {!enough && (
            <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>يلزم محوران على الأقل فيهما أفكار مدرجة في الوثيقة (غير مؤجلة أو مرفوضة) لكتابة المقال.</span>
            </div>
          )}

          {/* Length per axis */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-300 block">طول كل محور:</label>
            <div className="grid grid-cols-3 gap-1">
              {SECTION_LENGTHS.map(({ words, label }) => (
                <button
                  key={words}
                  type="button"
                  onClick={() => setOptions({ ...options, sectionLength: words })}
                  className={`py-1.5 rounded border text-[11px] transition ${
                    options.sectionLength === words
                      ? 'bg-amber-600/80 border-amber-500 text-white font-bold'
                      : 'bg-[#0a0a0a] border-[#2e2817] text-gray-400 hover:text-white'
                  }`}
                >
                  {label} ({formatWords(words)} كلمة)
                </button>
              ))}
            </div>
            <p className="text-[10.5px] text-gray-500">
              المقال كله نحو {formatWords(options.sectionLength * input.sections.length)} كلمة؛
              يُكتب كل محور على {toArabicDigits(partCount(options.sectionLength))} {partCount(options.sectionLength) > 1 ? 'أجزاء متتالية' : 'جزء واحد'}.
            </p>
          </div>

          {/* Story → reference article (style) and story passages */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-300 block">القصة:</label>
            <select
              value={options.storyName}
              onChange={e => setOptions({ ...options, storyName: e.target.value })}
              className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white text-xs focus:outline-none"
            >
              {storyChoices.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {reference ? (
              <p className="text-[10.5px] text-sky-300 leading-relaxed">📌 مرجع الأسلوب: «{reference.title}» (أحدث مقال مرجعي لهذه القصة)</p>
            ) : (
              <p className="text-[10.5px] text-amber-300/90 leading-relaxed">
                ⚠️ لا يوجد مقال مرجعي لهذه القصة؛ يُكتب المقال بدليل الأسلوب العام فقط.{' '}
                <button type="button" onClick={openReferenceModal} className="underline hover:text-white">إدخال مقال مرجعي</button>
              </p>
            )}
          </div>

          <p className="text-[10.5px] text-gray-400">
            الموديل: <span className="text-gray-200">{modelLabel(model)}</span>{' '}
            <button type="button" onClick={openKeyModal} className="underline hover:text-white">تغيير</button>
          </p>

          {/* Style */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-gray-300 block">الأسلوب:</label>
            <select
              value={options.styleMode}
              onChange={e => setOptions({ ...options, styleMode: e.target.value as ArticleOptions['styleMode'] })}
              className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white text-xs focus:outline-none"
            >
              <option value="rasheed-original">أسلوب د. رشيد الأصلي</option>
            </select>
          </div>

          {/* Deferred ideas */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeDeferred}
              onChange={e => setOptions({ ...options, includeDeferred: e.target.checked })}
              className="accent-amber-500"
            />
            <span className="text-gray-300">تضمين الأفكار المؤجلة</span>
            <span className="text-gray-500 font-mono">({toArabicDigits(deferredCount)})</span>
          </label>

          {lockedCount > 0 && (
            <div className="p-2 bg-[#0a0a0a] border border-[#2e2817] rounded text-gray-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              <span>{toArabicDigits(lockedCount)} محور مقفل سيبقى كما هو.</span>
            </div>
          )}

          <p className="text-[10.5px] text-gray-500 leading-relaxed">
            تُكتب المسودة محوراً محوراً وجزءاً جزءاً (قد يستغرق المقال الطويل عدة دقائق)، وتُدرَج نصوص الآيات من المصحف الموثّق لا من النموذج.
            تبقى المسودة موسومة «مسودة بمساعدة الذكاء الاصطناعي» حتى تعتمدها.
          </p>
        </div>

        <div className="px-4 py-3 bg-[#0a0a0a] border-t border-[#2e2817] rounded-b-xl flex justify-end gap-2">
          <button type="button" onClick={closeGenerateModal} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs">
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!enough || isGenerating || !aiAvailable}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>ابدأ الكتابة</span>
          </button>
        </div>
      </div>
    </div>
  );
};
