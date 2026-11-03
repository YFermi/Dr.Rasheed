import React, { useEffect, useRef, useState } from 'react';
import { useIdeaStore, REFERENCE_ARTICLE_PREFIX } from '../../store/useIdeaStore';
import { useReferenceStore, DEFAULT_STORY } from '../../store/useReferenceStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { callApiWithKey } from '../../utils/apiKey';
import { aiErrorMessage } from '../../utils/aiErrors';
import { readWordFile, WordReadError } from '../../utils/wordReader';
import type { ReferenceIdeaInput } from '../../types';
import { X, FileText, Upload, ClipboardPaste, Loader2, AlertCircle, RotateCw, Check, CheckCircle2, Pin } from 'lucide-react';

// Same limit as api/analyze-reference.ts
const MAX_ARTICLE_CHARS = 80_000;
const NEW_STORY = '__new__';

// The response of /api/analyze-reference
interface ReferenceIdea {
  title: string;
  summary: string;
  verses: string[];
  excerpt: string;
  excerptFound: boolean;
  axisIndex: number;
}
interface ReferenceAnalysis {
  title: string;
  structure: { introduction: string; axes: string[]; conclusion: string };
  ideas: ReferenceIdea[];
  styleNotes: string;
  seriesNotes: string;
}

type Step = 'input' | 'analyzing' | 'review' | 'done';
type ReviewIdea = ReferenceIdea & { key: string; accepted: boolean };

const formatCount = (n: number) => n.toLocaleString('en-US');

export const ReferenceArticleModal: React.FC = () => {
  const { isModalOpen, closeModal, stories, addArticle } = useReferenceStore();
  const importReferenceIdeas = useIdeaStore(state => state.importReferenceIdeas);
  const aiAvailable = useApiKeyStore(selectAiAvailable);
  const openKeyModal = useApiKeyStore(state => state.openModal);

  const [step, setStep] = useState<Step>('input');
  const [title, setTitle] = useState('');
  const [story, setStory] = useState(DEFAULT_STORY);
  const [newStory, setNewStory] = useState('');
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [glyphChars, setGlyphChars] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [analysis, setAnalysis] = useState<ReferenceAnalysis | null>(null);
  const [ideas, setIdeas] = useState<ReviewIdea[]>([]);
  const [result, setResult] = useState<{ count: number; title: string; saved: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Fresh state each time the modal opens
  useEffect(() => {
    if (!isModalOpen) return;
    setStep('input');
    setTitle('');
    setStory(DEFAULT_STORY);
    setNewStory('');
    setMode('file');
    setText('');
    setFileName('');
    setGlyphChars(0);
    setErrorMsg('');
    setCanRetry(false);
    setAnalysis(null);
    setIdeas([]);
    setResult(null);
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const storyName = story === NEW_STORY ? newStory.trim() : story;
  const isTooLong = text.length > MAX_ARTICLE_CHARS;
  const acceptedCount = ideas.filter(i => i.accepted).length;

  const handleClose = () => {
    controller.current?.abort();
    closeModal();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg('');
    setCanRetry(false);
    setIsReading(true);
    try {
      const { text: fileText, quranGlyphChars } = await readWordFile(file);
      setText(fileText);
      setFileName(file.name);
      setGlyphChars(quranGlyphChars);
      if (!title.trim()) setTitle(file.name.replace(/\.docx$/i, ''));
    } catch (e) {
      setErrorMsg(e instanceof WordReadError ? e.message : `تعذرت قراءة الملف: ${e instanceof Error ? e.message : String(e)}`);
      setText('');
      setFileName('');
    } finally {
      setIsReading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setErrorMsg(mode === 'file' ? 'اختر ملف Word أولاً.' : 'الصق نص المقال أولاً.');
      return;
    }
    if (isTooLong) return;
    if (!storyName) {
      setErrorMsg('اكتب اسم القصة الجديدة.');
      return;
    }
    setErrorMsg('');
    setCanRetry(false);
    setStep('analyzing');
    controller.current = new AbortController();
    try {
      const data = await callApiWithKey<ReferenceAnalysis>('/api/analyze-reference', { text, title, storyName }, controller.current.signal);
      if (!Array.isArray(data.ideas) || data.ideas.length === 0) {
        setErrorMsg('لم يُعثر على أفكار واضحة في المقال. تحقق من النص ثم أعد المحاولة.');
        setStep('input');
        return;
      }
      setAnalysis(data);
      setIdeas(data.ideas.map((idea, i) => ({ ...idea, key: `i${i}`, accepted: true })));
      if (!title.trim()) setTitle(data.title);
      setStep('review');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      console.warn('Reference analysis failed:', e);
      setErrorMsg(aiErrorMessage(e, 'تحليل المقال'));
      setCanRetry(true);
      setStep('input');
    } finally {
      controller.current = null;
    }
  };

  const updateIdea = (key: string, updates: Partial<ReviewIdea>) =>
    setIdeas(prev => prev.map(i => (i.key === key ? { ...i, ...updates } : i)));

  const handleAdd = () => {
    if (!analysis || acceptedCount === 0) return;
    const articleTitle = title.trim() || analysis.title || 'مقال مرجعي';
    const articleId = `ref-${Date.now()}`;
    // All of it goes under its own root axis «مقال مرجعي: …», by the article's axes
    const inputs: ReferenceIdeaInput[] = ideas.filter(i => i.accepted).map(i => ({
      title: i.title.trim() || 'فكرة مرجعية',
      summary: i.summary.trim(),
      verses: i.verses,
      excerpt: i.excerpt,
      newAxisLabel: analysis.structure.axes[i.axisIndex] ?? articleTitle,
    }));
    const count = importReferenceIdeas(inputs, articleId, articleTitle);
    // The full text and its style notes, for the style reference of later generation
    const saved = addArticle({
      id: articleId,
      title: articleTitle,
      storyName,
      fullText: text,
      styleNotes: analysis.styleNotes,
      ideaCount: count,
      dateAdded: new Date().toISOString(),
      structure: analysis.structure,
    });
    setResult({ count, title: articleTitle, saved });
    setStep('done');
  };

  const field = 'w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1 text-white focus:border-sky-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none text-right">
      <div role="dialog" aria-label="إدخال مقال مرجعي" className="bg-[#121212] border border-[#4a4027] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[#efe6cf]">
        {/* Header */}
        <div className="h-12 px-4 bg-[#0a0a0a] border-b border-[#2e2817] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white">📄 إدخال مقال مرجعي (مقال سابق مكتمل)</h2>
          </div>
          <button type="button" onClick={handleClose} title="إغلاق" className="p-1 hover:bg-[#2e2817] text-gray-400 hover:text-white rounded transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar p-5 space-y-4 text-xs font-sans">
          {!aiAvailable && step === 'input' && (
            <button type="button" onClick={openKeyModal} className="w-full p-2.5 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/60 rounded text-amber-200 text-right flex items-center justify-between transition">
              <span>🔑 أدخل مفتاح API لتحليل المقال بالذكاء الاصطناعي</span>
              <span className="text-[10.5px] underline">إدخال المفتاح</span>
            </button>
          )}

          {/* Step 1: input */}
          {step === 'input' && (
            <>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                أدخل مقالاً مكتملاً ومعتمداً. تُستخرج أفكاره وتسلسلها وتُضاف إلى الشجرة <strong className="text-sky-300">أفكاراً مرجعية 📌</strong>:
                للربط والاستدلال فقط، ولا تُكتب في نص المقال الجديد.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-300 block">عنوان المقال:</label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً: لماذا قدّم لوط بناته؟ (الجزء الثامن عشر)" className={`${field} font-quran text-sm`} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-gray-300 block">القصة:</label>
                  <div className="flex gap-1.5">
                    <select value={story} onChange={e => setStory(e.target.value)} className={`${field} text-xs`}>
                      {stories.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value={NEW_STORY}>+ قصة جديدة...</option>
                    </select>
                    {story === NEW_STORY && (
                      <input type="text" autoFocus value={newStory} onChange={e => setNewStory(e.target.value)} placeholder="اسم القصة" className={`${field} text-xs`} />
                    )}
                  </div>
                </div>
              </div>

              {/* File or paste */}
              <div className="space-y-2 border-t border-[#2e2817] pt-3">
                <div className="flex gap-1.5">
                  {([['file', 'رفع ملف Word', Upload], ['paste', 'لصق نص', ClipboardPaste]] as const).map(([value, label, Icon]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMode(value)}
                      className={`px-3 py-1.5 rounded border text-xs flex items-center gap-1.5 transition ${mode === value ? 'bg-sky-700/40 border-sky-500 text-sky-100 font-medium' : 'bg-[#0a0a0a] border-[#2e2817] text-gray-400 hover:text-white'}`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {label}
                    </button>
                  ))}
                </div>

                {mode === 'file' ? (
                  <label className="block p-5 border-2 border-dashed border-[#4a4027] hover:border-sky-500 rounded-lg text-center cursor-pointer transition">
                    <input type="file" accept=".docx" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                    {isReading ? (
                      <span className="flex items-center justify-center gap-2 text-gray-300"><Loader2 className="w-4 h-4 animate-spin" /> جاري قراءة الملف...</span>
                    ) : fileName ? (
                      <span className="flex items-center justify-center gap-2 text-emerald-300"><FileText className="w-4 h-4" /> {fileName} — انقر لاختيار ملف آخر</span>
                    ) : (
                      <span className="text-gray-400">انقر لاختيار ملف Word (.docx)</span>
                    )}
                  </label>
                ) : (
                  <textarea
                    rows={9}
                    value={text}
                    onChange={e => { setText(e.target.value); setFileName(''); setGlyphChars(0); }}
                    placeholder="الصق نص المقال المكتمل هنا..."
                    className={`w-full bg-[#0a0a0a] border rounded p-3 text-white font-quran text-sm leading-relaxed focus:outline-none placeholder-gray-600 ${isTooLong ? 'border-amber-500' : 'border-[#2e2817] focus:border-sky-500'}`}
                  />
                )}

                {text && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={isTooLong ? 'text-amber-300' : 'text-gray-500'}>
                      {isTooLong ? '⚠️ المقال يتجاوز الحد المسموح للتحليل.' : mode === 'file' ? 'نص الملف جاهز للتحليل.' : ''}
                    </span>
                    <span dir="ltr" className={`font-mono ${isTooLong ? 'text-amber-300 font-semibold' : 'text-gray-500'}`}>
                      {formatCount(text.length)} / {formatCount(MAX_ARTICLE_CHARS)} حرف
                    </span>
                  </div>
                )}
                {glyphChars > 0 && (
                  <p className="p-2 bg-amber-950/30 border border-amber-800/50 rounded text-[11px] text-amber-200 leading-relaxed">
                    ⚠️ في الملف {formatCount(glyphChars)} حرفاً مكتوبة بخط مصحف خاص، فتظهر نصوص بعض الآيات رموزاً في النص المستخرج.
                    يعتمد التحليل على مراجع الآيات المكتوبة بجوارها مثل [هود: 77].
                  </p>
                )}
              </div>

              {errorMsg && (
                <div role="alert" className="p-2.5 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{errorMsg}</span>
                  {canRetry && (
                    <button type="button" onClick={handleAnalyze} className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-100 rounded text-[11px] flex items-center gap-1 flex-shrink-0 transition">
                      <RotateCw className="w-3.5 h-3.5" /> <span>إعادة المحاولة</span>
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Step 2: analyzing */}
          {step === 'analyzing' && (
            <div className="py-16 flex flex-col items-center gap-3 text-gray-300">
              <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
              <p className="text-sm">جاري تحليل المقال...</p>
              <p className="text-[11px] text-gray-500">قد يستغرق ذلك حتى دقيقة للمقالات الطويلة.</p>
            </div>
          )}

          {/* Step 3: review */}
          {step === 'review' && analysis && (
            <div className="space-y-4">
              <div className="p-3 bg-[#0a0a0a] border border-[#2e2817] rounded-lg space-y-2">
                <h3 className="font-bold text-sm text-white">بنية المقال</h3>
                {analysis.structure.introduction && <p className="text-[11.5px] text-gray-300 leading-relaxed"><strong className="text-sky-300">المقدمة: </strong>{analysis.structure.introduction}</p>}
                <div className="space-y-1">
                  <span className="text-[11px] text-sky-300 font-semibold block">
                    المحاور (تُضاف تحت محور جذري جديد «{REFERENCE_ARTICLE_PREFIX} {title.trim() || analysis.title}»):
                  </span>
                  {analysis.structure.axes.map((label, i) => (
                    <div key={i} className="truncate font-quran text-[12.5px]">📐 {i + 1}. {label}</div>
                  ))}
                </div>
                {analysis.structure.conclusion && <p className="text-[11.5px] text-gray-300 leading-relaxed"><strong className="text-sky-300">الخاتمة: </strong>{analysis.structure.conclusion}</p>}
                {analysis.seriesNotes && <p className="text-[11px] text-gray-400 leading-relaxed"><strong>إحالات إلى أجزاء سابقة: </strong>{analysis.seriesNotes}</p>}
              </div>

              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white">الأفكار المستخرجة ({acceptedCount} من {ideas.length} مقبولة)</h3>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setIdeas(prev => prev.map(i => ({ ...i, accepted: true })))} className="px-2 py-1 bg-[#2e2817] hover:bg-[#4a4027] rounded text-[11px]">تحديد الكل</button>
                  <button type="button" onClick={() => setIdeas(prev => prev.map(i => ({ ...i, accepted: false })))} className="px-2 py-1 bg-[#2e2817] hover:bg-[#4a4027] rounded text-[11px]">إلغاء الكل</button>
                </div>
              </div>

              <div className="space-y-2.5">
                {ideas.map(idea => (
                  <div key={idea.key} className={`p-3 rounded-lg border transition-all ${idea.accepted ? 'bg-[#1e3a5f]/40 border-sky-700/60' : 'bg-[#0a0a0a]/40 border-[#2e2817] opacity-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={idea.accepted}
                        onChange={() => updateIdea(idea.key, { accepted: !idea.accepted })}
                        title={idea.accepted ? 'مقبولة (انقر للاستبعاد)' : 'مستبعدة (انقر للقبول)'}
                        className="w-4 h-4 accent-sky-500 flex-shrink-0"
                      />
                      <input type="text" value={idea.title} onChange={e => updateIdea(idea.key, { title: e.target.value })} className="flex-1 bg-[#121212] border border-[#2e2817] rounded px-2 py-1 text-white font-quran text-sm font-bold focus:border-sky-500 focus:outline-none" />
                      <span className="text-[10.5px] text-gray-400 flex-shrink-0 max-w-40 truncate" title={analysis.structure.axes[idea.axisIndex]}>
                        المحور {idea.axisIndex + 1}
                      </span>
                    </div>
                    <textarea rows={2} value={idea.summary} onChange={e => updateIdea(idea.key, { summary: e.target.value })} className="w-full bg-[#121212] border border-[#2e2817] rounded p-2 text-xs text-gray-300 font-quran focus:outline-none mb-1.5" />
                    {idea.verses.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {idea.verses.map(v => <span key={v} className="px-1.5 py-0.5 bg-amber-950/40 border border-amber-800/50 rounded text-[10.5px] text-amber-300 font-quran">[{v}]</span>)}
                      </div>
                    )}
                    {idea.excerpt && (
                      <blockquote className="border-r-2 border-sky-700 pr-2 text-[11.5px] text-gray-400 font-quran leading-relaxed max-h-24 overflow-auto custom-scrollbar">
                        «{idea.excerpt}»
                        {!idea.excerptFound && <span className="block text-[10.5px] text-amber-400 font-sans mt-0.5">⚠️ لم يُعثر على هذا الاقتباس حرفياً في نص المقال — راجعه.</span>}
                      </blockquote>
                    )}
                  </div>
                ))}
              </div>

              {analysis.styleNotes && (
                <div className="p-3 bg-[#0a0a0a] border border-[#2e2817] rounded-lg">
                  <h3 className="font-bold text-[12px] text-white mb-1">الملاحظات الأسلوبية (للاطلاع؛ تُحفظ مرجعاً للأسلوب)</h3>
                  <p className="text-[11.5px] text-gray-300 leading-relaxed whitespace-pre-wrap font-quran">{analysis.styleNotes}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: done */}
          {step === 'done' && result && (
            <div className="py-12 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-sm text-white font-quran">تمت إضافة {result.count} فكرة مرجعية من مقال «{result.title}».</p>
              {!result.saved && (
                <p className="max-w-md p-2 bg-amber-950/30 border border-amber-800/50 rounded text-[11px] text-amber-200">
                  ⚠️ لم يُحفظ نص المقال مرجعاً للأسلوب: مساحة التخزين في المتصفح ممتلئة. احذف مقالات مرجعية قديمة ثم أعد إدخاله.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-4 bg-[#0a0a0a] border-t border-[#2e2817] flex items-center justify-between flex-shrink-0">
          <button type="button" onClick={handleClose} className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition">
            {step === 'done' ? 'إغلاق' : 'إلغاء'}
          </button>
          {step === 'input' && (
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isReading || !text.trim() || isTooLong}
              className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded font-medium text-xs shadow-md transition"
            >
              <FileText className="w-4 h-4" /> <span>تحليل المقال</span>
            </button>
          )}
          {step === 'review' && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setStep('input')} className="px-3 py-1.5 bg-[#2e2817] hover:bg-[#4a4027] text-xs text-gray-300 rounded">← العودة للنص</button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={acceptedCount === 0}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium text-xs shadow-md transition"
              >
                <Check className="w-4 h-4" /> <span>إضافة الأفكار المقبولة للشجرة ({acceptedCount})</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
