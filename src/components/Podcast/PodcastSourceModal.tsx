import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, X, Upload } from 'lucide-react';
import { usePodcastStore, type PodcastArticleInput } from '../../store/usePodcastStore';
import { useReferenceStore } from '../../store/useReferenceStore';
import { useArticleStore } from '../../store/useArticleStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { formatProjectDate } from '../../utils/projectDate';
import { currentArticleSegments, draftToText } from '../../utils/podcastScript';
import { readWordFile, WordReadError } from '../../utils/wordReader';
import { toArabicDigits } from '../../utils/arabic';
import { PODCAST_LEAD_HOSTS, PODCAST_SPEAKERS, PODCAST_DISCLAIMER, type PodcastLeadHost } from '../../types/podcast';

const MAX_TEXT_CHARS = 120_000;
const DRAFT_OPTION = '__draft__';

const inputClass = 'w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white focus:border-[#d4af37] focus:outline-none';
const wordCountOf = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

// One of the two inputs: paste, a Word file, or a saved article copied into it
const ArticleInput: React.FC<{
  step: string;
  label: string;
  hint: string;
  value: PodcastArticleInput;
  onChange: (v: PodcastArticleInput) => void;
  saved: { value: string; label: string; title: string; text: () => string }[];
  ariaPrefix: string;
}> = ({ step, label, hint, value, onChange, saved, ariaPrefix }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { text } = await readWordFile(file);
      onChange({ title: value.title.trim() || file.name.replace(/\.docx$/i, ''), text: text.slice(0, MAX_TEXT_CHARS) });
    } catch (e) {
      setError(e instanceof WordReadError ? e.message : `تعذرت قراءة الملف: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <section className={`space-y-1.5 p-3 rounded-lg border ${value.text.trim() ? 'border-[#d4af37]/70' : 'border-[#2e2817]'} bg-[#0a0a0a]`} aria-label={label}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[#d4af37]">{step} {label}</h3>
        <span className="fs-10.5 text-[#8a7f66] whitespace-nowrap">{toArabicDigits(wordCountOf(value.text))} كلمة</span>
      </div>
      <p className="fs-10.5 text-[#8a7f66] leading-relaxed">{hint}</p>
      <input value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} placeholder="عنوان المقال" aria-label={`عنوان ${ariaPrefix}`} className={inputClass} />
      <textarea
        rows={4}
        value={value.text}
        onChange={e => onChange({ ...value, text: e.target.value.slice(0, MAX_TEXT_CHARS) })}
        placeholder="الصق نص المقال هنا…"
        aria-label={`نص ${ariaPrefix}`}
        className={`${inputClass} leading-relaxed select-text`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#4a4027] text-[#c2b691] hover:border-[#d4af37] hover:text-[#d4af37]">
          <Upload className="w-3.5 h-3.5" />
          <span>رفع ملف Word (.docx)</span>
        </button>
        {saved.length > 0 && (
          <select
            value=""
            aria-label={`مقال محفوظ في ${ariaPrefix}`}
            onChange={e => {
              const item = saved.find(s => s.value === e.target.value);
              if (item) onChange({ title: item.title, text: item.text().slice(0, MAX_TEXT_CHARS) });
            }}
            className="flex-1 min-w-0 bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1 text-[#c2b691] focus:outline-none"
          >
            <option value="">أو انسخ مقالاً محفوظاً…</option>
            {saved.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {error && <p className="fs-11 text-rose-300">{error}</p>}
    </section>
  );
};

// 🎙️ سكريبت تسجيل: two separate texts for two tracks (no idea extraction, no tree):
// ① the previous article feeds the introduction, ② the current article is the episode.
export const PodcastSourceModal: React.FC = () => {
  const { isModalOpen, closeModal, settings, generate, script, isGenerating } = usePodcastStore();
  const referenceArticles = useReferenceStore(state => state.referenceArticles);
  const draft = useArticleStore(state => state.draft);
  const aiAvailable = useApiKeyStore(selectAiAvailable);
  const openKeyModal = useApiKeyStore(state => state.openModal);

  const references = useMemo(
    () => [...referenceArticles].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
    [referenceArticles]
  );
  const savedReferences = references.map(a => ({ value: a.id, label: `📌 ${a.title}`, title: a.title, text: () => a.fullText }));
  const savedForCurrent = draft?.sections.length
    ? [...savedReferences, { value: DRAFT_OPTION, label: `✍️ المسودة: ${draft.title}`, title: draft.title, text: () => draftToText(draft) }]
    : savedReferences;

  const [previous, setPrevious] = useState<PodcastArticleInput>({ title: '', text: '' });
  const [current, setCurrent] = useState<PodcastArticleInput>({ title: '', text: '' });
  const [programName, setProgramName] = useState(settings.programName);
  const [episodeNumber, setEpisodeNumber] = useState(settings.nextEpisodeNumber);
  const [dateText, setDateText] = useState(formatProjectDate());
  const [leadHost, setLeadHost] = useState<PodcastLeadHost>(settings.leadHost);
  const [coGuest, setCoGuest] = useState(settings.coGuest);

  // Fresh values each time the window opens
  useEffect(() => {
    if (!isModalOpen) return;
    setPrevious({ title: '', text: '' });
    setCurrent({ title: '', text: '' });
    setProgramName(settings.programName);
    setEpisodeNumber(settings.nextEpisodeNumber);
    setDateText(formatProjectDate());
    setLeadHost(settings.leadHost);
    setCoGuest(settings.coGuest);
  }, [isModalOpen]);

  // How today's article will be split (segments = API calls)
  const bodySegments = useMemo(
    () => (current.text.trim() ? currentArticleSegments({ title: current.title, fullText: current.text }).segments.filter(s => s.kind !== 'intro') : []),
    [current]
  );

  if (!isModalOpen) return null;

  const ready = !!previous.text.trim() && !!current.text.trim();
  const canGenerate = ready && aiAvailable && !isGenerating && episodeNumber > 0;
  const handleGenerate = () => {
    if (!canGenerate) return;
    if (script && !window.confirm('سيحل السكريبت الجديد محل السكريبت الحالي. هل تريد المتابعة؟')) return;
    generate({ previous, current }, { programName: programName.trim() || settings.programName, episodeNumber, dateText: dateText.trim(), leadHost, coGuest });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none" onClick={closeModal}>
      <div
        role="dialog"
        aria-label="سكريبت تسجيل"
        className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-[#121212] border border-[#2e2817] rounded-xl shadow-2xl text-[#efe6cf] text-right"
        onClick={e => e.stopPropagation()}
      >
        <div className="h-11 px-4 bg-[#0a0a0a] border-b border-[#2e2817] rounded-t-xl flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 font-bold text-sm text-[#d4af37]">
            <Mic className="w-4 h-4" />
            <span>🎙️ سكريبت تسجيل</span>
          </div>
          <button type="button" onClick={closeModal} title="إغلاق" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs overflow-auto custom-scrollbar">
          <p className="fs-11 text-[#c2b691] leading-relaxed">
            مساران منفصلان يُدمجان في سكريبت واحد، دون استخراج أفكار أو شجرة: المقدمة من المقال السابق وحده، وصلب الحلقة من المقال الحالي وحده.
          </p>

          <ArticleInput
            step="①"
            label="المقال السابق (للتلخيص والمقدمة)"
            hint="حلقة الأمس: يلخّصه المحاورون الثلاثة ويناقشون قضاياه وأدلته وآياته في المقدمة التمهيدية. لا يدخل شيء منه في صلب الحلقة."
            value={previous}
            onChange={setPrevious}
            saved={savedReferences}
            ariaPrefix="المقال السابق"
          />

          <ArticleInput
            step="②"
            label="المقال الحالي (موضوع حلقة اليوم)"
            hint="يتحول نصه حرفياً إلى أسئلة من المحاورين وإجابات من د. رشيد ببروتوكول المقص الذكي، فقرة بعد فقرة، دون تلخيص."
            value={current}
            onChange={setCurrent}
            saved={savedForCurrent}
            ariaPrefix="المقال الحالي"
          />

          {ready && (
            <div className="fs-10.5 text-[#c2b691] leading-relaxed p-2 rounded border border-[#2e2817]">
              المقدمة: من «{previous.title || 'المقال السابق'}» ({toArabicDigits(wordCountOf(previous.text))} كلمة)
              <br />
              صلب الحلقة والخاتمة: {toArabicDigits(bodySegments.length)} مقاطع من «{current.title || 'المقال الحالي'}» — {bodySegments.map(s => s.title).join(' • ')}
            </div>
          )}

          {/* Episode */}
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 space-y-1">
              <span className="fs-11 text-gray-300 block">اسم البرنامج:</span>
              <input value={programName} onChange={e => setProgramName(e.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1">
              <span className="fs-11 text-gray-300 block">رقم الحلقة:</span>
              <input type="number" min={1} value={episodeNumber} onChange={e => setEpisodeNumber(Number(e.target.value))} className={`${inputClass} text-[#d4af37] font-bold`} />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="fs-11 text-gray-300 block">التاريخ (هجري وميلادي):</span>
            <input value={dateText} onChange={e => setDateText(e.target.value)} className={inputClass} />
          </label>

          {/* Cast */}
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="fs-11 text-gray-300 block">قائد الحلقة:</span>
              <select
                value={leadHost}
                onChange={e => setLeadHost(e.target.value as PodcastLeadHost)}
                aria-label="قائد الحلقة"
                className={`${inputClass} text-[#d4af37] font-bold`}
              >
                {PODCAST_LEAD_HOSTS.map(h => (
                  <option key={h} value={h}>{PODCAST_SPEAKERS[h]} — {h === 'zakaria' ? 'يفتتح بالفصحى' : 'يفتتح بالمصرية البيضاء'}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 p-2 mt-4 rounded border border-[#2e2817] cursor-pointer">
              <input type="checkbox" checked={coGuest} onChange={e => setCoGuest(e.target.checked)} aria-label="ضيف مشارك" className="accent-[#d4af37]" />
              <span className="fs-11">ضيف مشارك: {PODCAST_SPEAKERS.ali}</span>
            </label>
          </div>
          <p className="fs-10.5 text-[#8a7f66] leading-relaxed">
            {leadHost === 'zakaria'
              ? 'زكريا يفتتح (مع إخلاء المسؤولية) ويستعرض المقال السابق، ثم محمد، ثم مصطفى، ثم يعود لزكريا ليطرح على د. رشيد السؤال الأول من بداية المقال الحالي.'
              : 'مصطفى يفتتح (مع إخلاء المسؤولية) ويستعرض المقال السابق، ثم زكريا، ثم محمد، ثم يعود لمصطفى ليطرح على د. رشيد السؤال الأول من بداية المقال الحالي.'}
          </p>
          <details className="rounded border border-[#2e2817] bg-[#0a0a0a] p-2">
            <summary className="fs-11 text-gray-300 cursor-pointer">إخلاء المسؤولية المنهجي: نص ثابت يقرؤه قائد الحلقة أول السكريبت</summary>
            <p className="mt-2 fs-11 text-[#8a7f66] leading-relaxed">{PODCAST_DISCLAIMER}</p>
          </details>

          {!aiAvailable && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/60 rounded text-amber-200 flex items-center justify-between gap-2">
              <span>🔑 يرجى إدخال مفتاح API أولاً</span>
              <button type="button" onClick={openKeyModal} className="fs-10.5 underline hover:text-white flex-shrink-0">إدخال المفتاح</button>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#2e2817] flex items-center justify-between gap-2 flex-shrink-0">
          <button type="button" onClick={closeModal} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">إلغاء</button>
          <div className="flex items-center gap-3">
            {!ready && <span className="fs-10.5 text-[#8a7f66]">يلزم النصان ① و②</span>}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="px-4 py-1.5 rounded text-xs font-bold bg-gradient-to-b from-[#e3c66b] to-[#b8901f] text-[#0a0a0a] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🎙️ توليد السكريبت
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
