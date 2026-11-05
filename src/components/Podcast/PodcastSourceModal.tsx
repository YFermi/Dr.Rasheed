import React, { useEffect, useMemo, useState } from 'react';
import { Mic, X, AlertTriangle } from 'lucide-react';
import { usePodcastStore } from '../../store/usePodcastStore';
import { useReferenceStore } from '../../store/useReferenceStore';
import { useArticleStore } from '../../store/useArticleStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { formatProjectDate } from '../../utils/projectDate';
import { draftSegments, referenceSegments } from '../../utils/podcastScript';
import { toArabicDigits } from '../../utils/arabic';
import { PODCAST_HOSTS, PODCAST_SPEAKERS, PODCAST_DISCLAIMER, type PodcastHost, type PodcastSource } from '../../types/podcast';

// 🎙️ سكريبت تسجيل: choose the article (a reference article or the current draft)
// and the episode details, then generate.
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
  const hasDraft = !!draft?.sections.length;

  const [source, setSource] = useState<Pick<PodcastSource, 'kind' | 'id'> | null>(null);
  const [programName, setProgramName] = useState(settings.programName);
  const [episodeNumber, setEpisodeNumber] = useState(settings.nextEpisodeNumber);
  const [dateText, setDateText] = useState(formatProjectDate());
  const [leadHost, setLeadHost] = useState<PodcastHost>(settings.leadHost);

  // Fresh values each time the window opens: newest reference article first
  useEffect(() => {
    if (!isModalOpen) return;
    setSource(references[0] ? { kind: 'reference', id: references[0].id } : hasDraft ? { kind: 'draft', id: 'draft' } : null);
    setProgramName(settings.programName);
    setEpisodeNumber(settings.nextEpisodeNumber);
    setDateText(formatProjectDate());
    setLeadHost(settings.leadHost);
  }, [isModalOpen]);

  // How the chosen article will be split (segments = API calls)
  const preview = useMemo(() => {
    if (!source) return null;
    if (source.kind === 'draft') return draft ? draftSegments(draft).segments : null;
    const article = references.find(a => a.id === source.id);
    return article ? referenceSegments(article).segments : null;
  }, [source, references, draft]);

  if (!isModalOpen) return null;

  const canGenerate = !!source && !!preview && aiAvailable && !isGenerating && episodeNumber > 0;
  const handleGenerate = () => {
    if (!canGenerate || !source) return;
    if (script && !window.confirm('سيحل السكريبت الجديد محل السكريبت الحالي. هل تريد المتابعة؟')) return;
    generate(source, { programName: programName.trim() || settings.programName, episodeNumber, dateText: dateText.trim(), leadHost });
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

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 select-none" onClick={closeModal}>
      <div
        role="dialog"
        aria-label="سكريبت تسجيل"
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-[#121212] border border-[#2e2817] rounded-xl shadow-2xl text-[#efe6cf] text-right"
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
          {/* Source */}
          <div className="space-y-1.5">
            <span className="fs-11 text-gray-300 block">المقال الذي يتحول إلى حوار:</span>
            {references.map(a =>
              <React.Fragment key={a.id}>
                {option(source?.kind === 'reference' && source.id === a.id, () => setSource({ kind: 'reference', id: a.id }),
                  `📌 ${a.title}`, `مقال مرجعي — أُضيف ${new Date(a.dateAdded).toLocaleDateString('ar-u-nu-latn')}`)}
              </React.Fragment>
            )}
            {hasDraft && option(source?.kind === 'draft', () => setSource({ kind: 'draft', id: 'draft' }),
              `📝 ${draft!.title}`, draft!.approvedAt ? 'المسودة الحالية (معتمدة)' : 'المسودة الحالية (غير معتمدة بعد)')}
            {!references.length && !hasDraft && (
              <div className="p-2.5 bg-rose-950/40 border border-rose-800/60 rounded text-rose-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>لا يوجد مقال بعد: أضف مقالاً مرجعياً (📄 مقال مرجعي) أو اكتب المقال (✍️ كتابة المقال) أولاً.</span>
              </div>
            )}
            {preview && (
              <div className="fs-10.5 text-[#c2b691] leading-relaxed">
                سيُكتب الحوار في {toArabicDigits(preview.length)} مقاطع: {preview.map(s => s.title).join(' • ')}
              </div>
            )}
          </div>

          {/* Episode */}
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-2 space-y-1">
              <span className="fs-11 text-gray-300 block">اسم البرنامج:</span>
              <input value={programName} onChange={e => setProgramName(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white focus:border-[#d4af37] focus:outline-none" />
            </label>
            <label className="space-y-1">
              <span className="fs-11 text-gray-300 block">رقم الحلقة:</span>
              <input type="number" min={1} value={episodeNumber} onChange={e => setEpisodeNumber(Number(e.target.value))} className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-[#d4af37] font-bold focus:border-[#d4af37] focus:outline-none" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="fs-11 text-gray-300 block">التاريخ (هجري وميلادي):</span>
            <input value={dateText} onChange={e => setDateText(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-white focus:border-[#d4af37] focus:outline-none" />
          </label>
          <label className="block space-y-1">
            <span className="fs-11 text-gray-300 block">المذيع الرئيسي للحلقة (يفتتح بعد إخلاء المسؤولية، ويسترجع الحلقة السابقة، ويختتم):</span>
            <select
              value={leadHost}
              onChange={e => setLeadHost(e.target.value as PodcastHost)}
              aria-label="المذيع الرئيسي للحلقة"
              className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1.5 text-[#d4af37] font-bold focus:border-[#d4af37] focus:outline-none"
            >
              {PODCAST_HOSTS.map(h => <option key={h} value={h}>{PODCAST_SPEAKERS[h]}</option>)}
            </select>
          </label>
          <details className="rounded border border-[#2e2817] bg-[#0a0a0a] p-2">
            <summary className="fs-11 text-gray-300 cursor-pointer">إخلاء المسؤولية: نص ثابت يقرؤه زكريا أول السكريبت</summary>
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
