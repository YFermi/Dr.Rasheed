import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, X, AlertTriangle, Upload } from 'lucide-react';
import { usePodcastStore, type PodcastSourceInput } from '../../store/usePodcastStore';
import { useReferenceStore } from '../../store/useReferenceStore';
import { useArticleStore } from '../../store/useArticleStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { formatProjectDate } from '../../utils/projectDate';
import { draftSegments, referenceSegments } from '../../utils/podcastScript';
import { readWordFile, WordReadError } from '../../utils/wordReader';
import { toArabicDigits } from '../../utils/arabic';
import { PODCAST_LEAD_HOSTS, PODCAST_SPEAKERS, PODCAST_DISCLAIMER, type PodcastLeadHost } from '../../types/podcast';

type Choice = { kind: 'text' } | { kind: 'reference'; id: string } | { kind: 'draft' };
// The previous episode (the introduction recaps its full text)
type PreviousChoice = 'none' | 'paste' | string; // string: a reference article id

const MAX_TEXT_CHARS = 120_000;

// 🎙️ سكريبت تسجيل: the article goes straight to dialog — pasted text or a Word
// file, a reference article, or the current draft (no idea extraction, no tree).
export const PodcastSourceModal: React.FC = () => {
  const { isModalOpen, closeModal, settings, generate, script, isGenerating } = usePodcastStore();
  const referenceArticles = useReferenceStore(state => state.referenceArticles);
  const draft = useArticleStore(state => state.draft);
  const aiAvailable = useApiKeyStore(selectAiAvailable);
  const openKeyModal = useApiKeyStore(state => state.openModal);
  const fileRef = useRef<HTMLInputElement>(null);

  const references = useMemo(
    () => [...referenceArticles].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)),
    [referenceArticles]
  );
  const hasDraft = !!draft?.sections.length;

  const [choice, setChoice] = useState<Choice>({ kind: 'text' });
  const [textTitle, setTextTitle] = useState('');
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [programName, setProgramName] = useState(settings.programName);
  const [episodeNumber, setEpisodeNumber] = useState(settings.nextEpisodeNumber);
  const [dateText, setDateText] = useState(formatProjectDate());
  const [leadHost, setLeadHost] = useState<PodcastLeadHost>(settings.leadHost);
  const [coGuest, setCoGuest] = useState(settings.coGuest);
  const [previousChoice, setPreviousChoice] = useState<PreviousChoice>('none');
  const [previousTitle, setPreviousTitle] = useState('');
  const [previousText, setPreviousText] = useState('');

  // Fresh values each time the window opens
  useEffect(() => {
    if (!isModalOpen) return;
    setChoice({ kind: 'text' });
    setFileError(null);
    setProgramName(settings.programName);
    setEpisodeNumber(settings.nextEpisodeNumber);
    setDateText(formatProjectDate());
    setLeadHost(settings.leadHost);
    setCoGuest(settings.coGuest);
    setPreviousText('');
    setPreviousTitle('');
  }, [isModalOpen]);

  // Default previous episode: the reference article just before the chosen one
  // (or the newest one for a new text or the draft)
  useEffect(() => {
    if (!isModalOpen) return;
    const others = choice.kind === 'reference' ? references.slice(references.findIndex(a => a.id === choice.id) + 1) : references;
    setPreviousChoice(others[0]?.id ?? 'none');
  }, [isModalOpen, choice.kind, choice.kind === 'reference' ? choice.id : '']);

  // How the chosen article will be split (segments = API calls)
  const preview = useMemo(() => {
    if (choice.kind === 'text') return text.trim() ? referenceSegments({ title: textTitle, fullText: text }).segments : null;
    if (choice.kind === 'draft') return draft ? draftSegments(draft).segments : null;
    const article = references.find(a => a.id === choice.id);
    return article ? referenceSegments(article).segments : null;
  }, [choice, references, draft, text, textTitle]);

  if (!isModalOpen) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const { text: fileText } = await readWordFile(file);
      setText(fileText.slice(0, MAX_TEXT_CHARS));
      if (!textTitle.trim()) setTextTitle(file.name.replace(/\.docx$/i, ''));
    } catch (e) {
      setFileError(e instanceof WordReadError ? e.message : `تعذرت قراءة الملف: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const source: PodcastSourceInput | null =
    choice.kind === 'text' ? { kind: 'text', title: textTitle, text } :
    choice.kind === 'draft' ? { kind: 'draft', id: 'draft' } :
    { kind: 'reference', id: choice.id };

  const previousArticle = previousChoice !== 'none' && previousChoice !== 'paste' ? references.find(a => a.id === previousChoice) : undefined;
  const previous =
    previousChoice === 'paste' ? (previousText.trim() ? { title: previousTitle, text: previousText } : null) :
    previousArticle ? { title: previousArticle.title, text: previousArticle.fullText } : null;

  const canGenerate = !!source && !!preview && aiAvailable && !isGenerating && episodeNumber > 0;
  const handleGenerate = () => {
    if (!canGenerate || !source) return;
    if (script && !window.confirm('سيحل السكريبت الجديد محل السكريبت الحالي. هل تريد المتابعة؟')) return;
    generate(source, { programName: programName.trim() || settings.programName, episodeNumber, dateText: dateText.trim(), leadHost, coGuest }, previous);
  };

  const option = (checked: boolean, onChange: () => void, title: string, detail: string) => (
    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'border-[#d4af37] bg-[#1f1d18]' : 'border-[#2e2817] hover:border-[#4a4027]'}`}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 accent-[#d4af37]" />
      <span className="space-y-0.5">
        <span className="block text-white font-semibold">{title}</span>
        <span className="block fs-10.5 text-[#8a7f66]">{detail}</span>
      </span>
    </label>
  );
  const inputClass = 'w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white focus:border-[#d4af37] focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none" onClick={closeModal}>
      <div
        role="dialog"
        aria-label="سكريبت تسجيل"
        className="w-full max-w-xl max-h-[92vh] flex flex-col bg-[#121212] border border-[#2e2817] rounded-xl shadow-2xl text-[#efe6cf] text-right"
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
          {/* Source: straight from the article, no idea tree */}
          <div className="space-y-1.5">
            <span className="fs-11 text-gray-300 block">المقال الذي يتحول مباشرة إلى حوار (دون استخراج أفكار أو شجرة):</span>
            {option(choice.kind === 'text', () => setChoice({ kind: 'text' }), '📝 لصق نص المقال أو رفع ملف Word', 'المسار المباشر: يتحول النص إلى سكريبت كما هو')}
            {choice.kind === 'text' && (
              <div className="space-y-1.5 p-2.5 rounded-lg border border-[#2e2817] bg-[#0a0a0a]">
                <input value={textTitle} onChange={e => setTextTitle(e.target.value)} placeholder="عنوان المقال" aria-label="عنوان المقال" className={inputClass} />
                <textarea
                  rows={6}
                  value={text}
                  onChange={e => setText(e.target.value.slice(0, MAX_TEXT_CHARS))}
                  placeholder="الصق نص المقال هنا…"
                  aria-label="نص المقال"
                  className={`${inputClass} leading-relaxed select-text`}
                />
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#4a4027] text-[#c2b691] hover:border-[#d4af37] hover:text-[#d4af37]">
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف Word (.docx)</span>
                  </button>
                  <span className="fs-10.5 text-[#8a7f66]">{toArabicDigits(text.trim() ? text.trim().split(/\s+/).length : 0)} كلمة</span>
                  <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                </div>
                {fileError && <p className="fs-11 text-rose-300">{fileError}</p>}
              </div>
            )}
            {references.map(a =>
              <React.Fragment key={a.id}>
                {option(choice.kind === 'reference' && choice.id === a.id, () => setChoice({ kind: 'reference', id: a.id }),
                  `📌 ${a.title}`, `مقال مرجعي — أُضيف ${new Date(a.dateAdded).toLocaleDateString('ar-u-nu-latn')}`)}
              </React.Fragment>
            )}
            {hasDraft && option(choice.kind === 'draft', () => setChoice({ kind: 'draft' }),
              `✍️ ${draft!.title}`, draft!.approvedAt ? 'المسودة الحالية (معتمدة)' : 'المسودة الحالية (غير معتمدة بعد)')}
            {preview && (
              <div className="fs-10.5 text-[#c2b691] leading-relaxed">
                سيُكتب الحوار في {toArabicDigits(preview.length)} مقاطع: {preview.map(s => s.title).join(' • ')}
              </div>
            )}
          </div>

          {/* Previous episode: the material of a rich introduction */}
          <div className="space-y-1.5">
            <label className="block space-y-1">
              <span className="fs-11 text-gray-300 block">الحلقة السابقة (تستعرض المقدمة التمهيدية قضاياها وأدلتها وآياتها من نصها الكامل):</span>
              <select value={previousChoice} onChange={e => setPreviousChoice(e.target.value)} aria-label="الحلقة السابقة" className={inputClass}>
                {references.filter(a => !(choice.kind === 'reference' && a.id === choice.id)).map(a => (
                  <option key={a.id} value={a.id}>📌 {a.title}</option>
                ))}
                <option value="paste">📝 لصق نص الحلقة السابقة</option>
                <option value="none">بلا — من تلخيص افتتاحية المقال فقط (مقدمة أقصر)</option>
              </select>
            </label>
            {previousChoice === 'paste' && (
              <div className="space-y-1.5 p-2.5 rounded-lg border border-[#2e2817] bg-[#0a0a0a]">
                <input value={previousTitle} onChange={e => setPreviousTitle(e.target.value)} placeholder="عنوان الحلقة السابقة" aria-label="عنوان الحلقة السابقة" className={inputClass} />
                <textarea rows={4} value={previousText} onChange={e => setPreviousText(e.target.value.slice(0, MAX_TEXT_CHARS))} placeholder="الصق نص مقال الحلقة السابقة…" aria-label="نص الحلقة السابقة" className={`${inputClass} leading-relaxed select-text`} />
              </div>
            )}
            {previousChoice === 'none' && (
              <p className="fs-10.5 text-amber-300/80">دون نص الحلقة السابقة تبقى المقدمة محدودة بما في افتتاحية المقال من تلخيص.</p>
            )}
          </div>

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
              ? 'زكريا يفتتح (مع إخلاء المسؤولية) ويلخّص الثلث الأول، ثم محمد، ثم مصطفى، ثم يعود لزكريا ليطرح السؤال الأول على د. رشيد.'
              : 'مصطفى يفتتح (مع إخلاء المسؤولية) ويلخّص الثلث الأول، ثم زكريا، ثم محمد، ثم يعود لمصطفى ليطرح السؤال الأول على د. رشيد.'}
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
          {choice.kind === 'text' && !text.trim() && (
            <div className="p-2.5 bg-[#0a0a0a] border border-[#2e2817] rounded text-[#8a7f66] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>الصق نص المقال أو ارفع ملف Word، أو اختر مقالاً مرجعياً أو المسودة.</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#2e2817] flex items-center justify-between gap-2 flex-shrink-0">
          <button type="button" onClick={closeModal} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">إلغاء</button>
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
  );
};
