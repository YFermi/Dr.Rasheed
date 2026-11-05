import React, { useState } from 'react';
import { Mic, FileDown, Loader2, RefreshCw, Plus, Trash2, Play, Square, AlertTriangle, X } from 'lucide-react';
import { usePodcastStore } from '../../store/usePodcastStore';
import { exportPodcastToWord } from '../../utils/podcastDocxExport';
import { toArabicDigits } from '../../utils/arabic';
import { DEFAULT_LEAD_HOST, PODCAST_DISCLAIMER, PODCAST_SPEAKERS, type PodcastLine, type PodcastSegment, type PodcastSpeaker } from '../../types/podcast';

// 🎙️ سكريبت التسجيل: the generated studio script in black and gold; every line can
// be edited in place, and every segment written again (with an optional note).

export const SPEAKER_BADGES: Record<PodcastSpeaker, string> = {
  rasheed: 'bg-[#d4af37] text-[#0a0a0a] border-[#d4af37]',
  yousef: 'bg-sky-950/70 text-sky-200 border-sky-700',
  mustafa: 'bg-emerald-950/70 text-emerald-200 border-emerald-700',
  zakaria: 'bg-rose-950/70 text-rose-200 border-rose-700',
};

const SPEAKER_ORDER: PodcastSpeaker[] = ['yousef', 'rasheed', 'mustafa', 'zakaria'];

const autoSize = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

const SpeakerBadge: React.FC<{ speaker: PodcastSpeaker; onChange?: (s: PodcastSpeaker) => void }> = ({ speaker, onChange }) =>
  onChange ? (
    <select
      value={speaker}
      onChange={e => onChange(e.target.value as PodcastSpeaker)}
      title="تغيير المتحدث"
      className={`px-2 py-0.5 rounded-full border fs-11 font-bold cursor-pointer appearance-none text-center focus:outline-none ${SPEAKER_BADGES[speaker]}`}
    >
      {SPEAKER_ORDER.map(s => <option key={s} value={s} className="bg-[#0a0a0a] text-[#efe6cf]">{PODCAST_SPEAKERS[s]}</option>)}
    </select>
  ) : (
    <span className={`px-2 py-0.5 rounded-full border fs-11 font-bold whitespace-nowrap ${SPEAKER_BADGES[speaker]}`}>{PODCAST_SPEAKERS[speaker]}</span>
  );

// Text that becomes a textarea on click; saved on blur
const EditableText: React.FC<{ value: string; onSave: (v: string) => void; placeholder?: string; className?: string }> = ({ value, onSave, placeholder, className = '' }) => {
  const [editing, setEditing] = useState(!value);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <p onClick={() => { setDraft(value); setEditing(true); }} title="انقر للتعديل" className={`cursor-text whitespace-pre-wrap rounded hover:bg-white/5 transition ${className}`}>
        {value}
      </p>
    );
  }
  return (
    <textarea
      ref={autoSize}
      autoFocus={!!value}
      value={draft}
      placeholder={placeholder}
      onChange={e => { setDraft(e.target.value); autoSize(e.target); }}
      onBlur={() => { if (draft.trim()) { onSave(draft.trim()); setEditing(false); } }}
      className={`w-full resize-none bg-[#0a0a0a] border border-[#d4af37]/60 rounded p-2 focus:outline-none ${className}`}
    />
  );
};

const VerseBox: React.FC<{ line: PodcastLine; onDelete: () => void }> = ({ line, onDelete }) => (
  <div className="group relative my-3 mx-6 px-5 py-4 rounded-lg border-x-4 border-y border-[#d4af37] bg-gradient-to-b from-[#2b2208] to-[#1f1a0b] text-center shadow-[0_0_18px_rgba(212,175,55,0.15)]">
    {line.unresolved || !line.text ? (
      <span className="text-rose-300 fs-13">تعذر العثور على الآية: {line.ref}</span>
    ) : (
      <p className="font-quran fs-19 leading-loose text-[#f6edcf]">﴿{line.text}﴾</p>
    )}
    <span className="block mt-1 fs-12 text-[#d4af37]">[{(line.ref ?? '').replace(':', ': ')}]</span>
    <button type="button" onClick={onDelete} title="حذف الآية" className="absolute top-1.5 left-1.5 p-1 text-[#8a7f66] hover:text-rose-300 opacity-0 group-hover:opacity-100 transition">
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  </div>
);

const SegmentBlock: React.FC<{ segment: PodcastSegment }> = ({ segment }) => {
  const { isGenerating, regenerateSegment, updateLine, deleteLine, insertLineAfter } = usePodcastStore();
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState('');

  const regenerate = () => {
    if (segment.lines.length && !window.confirm(`إعادة كتابة «${segment.title}» تستبدل أسطره الحالية (ومنها تعديلاتك). هل تريد المتابعة؟`)) return;
    setAskNote(false);
    regenerateSegment(segment.id, note);
    setNote('');
  };

  return (
    <section className="space-y-2" data-segment={segment.id}>
      <div className="flex items-center gap-3 pt-6 pb-2">
        <div className="h-px flex-1 bg-gradient-to-l from-[#d4af37]/60 to-transparent" />
        <h3 className="fs-15 font-bold text-[#d4af37] whitespace-nowrap">{segment.title}</h3>
        <div className="h-px flex-1 bg-gradient-to-r from-[#d4af37]/60 to-transparent" />
        <div className="flex items-center gap-1 no-print">
          {segment.status === 'generating' && <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />}
          <button
            type="button"
            onClick={() => setAskNote(!askNote)}
            disabled={isGenerating}
            title="إعادة توليد هذا المقطع"
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-[#4a4027] fs-11 text-[#c2b691] hover:text-[#d4af37] hover:border-[#d4af37] disabled:opacity-40 transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>إعادة توليد</span>
          </button>
        </div>
      </div>

      {askNote && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-[#4a4027] bg-[#0a0a0a] no-print">
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && regenerate()}
            placeholder="ملاحظة اختيارية: مثلاً «أكثر أسئلة من زكريا» أو «لا تختصر الشرح الثاني»"
            className="flex-1 bg-transparent fs-12 text-[#efe6cf] placeholder:text-[#8a7f66] focus:outline-none"
          />
          <button type="button" onClick={regenerate} className="px-2.5 py-1 rounded bg-[#d4af37] text-[#0a0a0a] fs-11 font-bold">توليد</button>
          <button type="button" onClick={() => setAskNote(false)} className="text-[#8a7f66] hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {segment.status === 'error' && segment.error && (
        <div className="p-2.5 rounded border border-rose-800/60 bg-rose-950/40 text-rose-200 fs-12 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{segment.error}</span>
        </div>
      )}
      {segment.status === 'pending' && !segment.lines.length && (
        <p className="fs-12 text-[#8a7f66] text-center py-2">لم يُكتب هذا المقطع بعد.</p>
      )}
      {segment.rejectedRefs?.length ? (
        <p className="fs-11 text-amber-300/80 no-print">حُذفت آيات خارج مراجع المقال: {segment.rejectedRefs.join('، ')}</p>
      ) : null}

      {segment.lines.map(line =>
        line.type === 'verse' ? (
          <VerseBox key={line.id} line={line} onDelete={() => deleteLine(segment.id, line.id)} />
        ) : (
          <div key={line.id} className="group flex items-start gap-3">
            <div className="w-28 flex-shrink-0 flex justify-end pt-1">
              <SpeakerBadge speaker={line.speaker ?? 'rasheed'} onChange={s => updateLine(segment.id, line.id, { speaker: s })} />
            </div>
            <div className="flex-1 min-w-0">
              <EditableText
                value={line.text}
                placeholder="اكتب نص المداخلة…"
                onSave={text => updateLine(segment.id, line.id, { text })}
                className={`fs-15 leading-loose px-2 py-1 ${line.speaker === 'rasheed' ? 'text-[#f6edcf]' : 'text-[#c2b691]'}`}
              />
            </div>
            <div className="flex flex-col gap-1 pt-1 opacity-0 group-hover:opacity-100 transition no-print">
              <button type="button" onClick={() => insertLineAfter(segment.id, line.id)} title="إضافة مداخلة بعدها" className="p-1 text-[#8a7f66] hover:text-[#d4af37]"><Plus className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => deleteLine(segment.id, line.id)} title="حذف المداخلة" className="p-1 text-[#8a7f66] hover:text-rose-300"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )
      )}
    </section>
  );
};

export const PodcastScriptView: React.FC = () => {
  const { script, isGenerating, progress, error, openModal, resume, cancel, updateEpisode, clearError } = usePodcastStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!script) return;
    try {
      setIsExporting(true);
      await exportPodcastToWord(script);
    } finally {
      setIsExporting(false);
    }
  };

  if (!script) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-[#c2b691] p-8 text-center">
        <Mic className="w-12 h-12 text-[#d4af37]" />
        <p className="fs-15 max-w-md leading-relaxed">حوّل المقال المرجعي المعتمد أو المسودة الحالية إلى سكريبت حواري للتسجيل بين د. رشيد الجراح وفريق البرنامج.</p>
        <button type="button" onClick={openModal} className="px-4 py-2 rounded bg-gradient-to-b from-[#e3c66b] to-[#b8901f] text-[#0a0a0a] font-bold text-sm">🎙️ سكريبت تسجيل جديد</button>
      </div>
    );
  }

  const unfinished = script.segments.some(s => s.status !== 'done');
  const words = script.segments.reduce((n, s) => n + s.lines.reduce((m, l) => m + (l.type === 'speech' ? l.text.split(/\s+/).filter(Boolean).length : 0), 0), 0);

  return (
    <div className="h-full flex flex-col bg-[#050505] text-[#efe6cf] select-text">
      {/* Toolbar */}
      <div className="min-h-11 py-1 px-4 bg-[#0a0a0a] border-b border-[#2e2817] flex flex-wrap items-center justify-between gap-2 no-print select-none">
        <div className="flex items-center gap-2 text-sm font-bold text-[#d4af37]">
          <Mic className="w-4 h-4" />
          <span>سكريبت التسجيل</span>
          <span className="fs-11 font-normal text-[#8a7f66]">≈ {toArabicDigits(words)} كلمة</span>
        </div>
        <div className="flex items-center gap-2">
          {isGenerating && progress && (
            <>
              <span className="flex items-center gap-1.5 fs-11 text-[#c2b691]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#d4af37]" />
                {toArabicDigits(progress.step)}/{toArabicDigits(progress.total)} — {progress.label}
              </span>
              <button type="button" onClick={cancel} className="flex items-center gap-1 px-2 py-1 rounded border border-rose-800 text-rose-300 text-xs hover:bg-rose-950/50"><Square className="w-3 h-3" />إيقاف</button>
            </>
          )}
          {!isGenerating && unfinished && (
            <button type="button" onClick={resume} className="flex items-center gap-1 px-2.5 py-1 rounded border border-[#d4af37] text-[#d4af37] text-xs hover:bg-[#1f1d18]"><Play className="w-3 h-3" />استئناف الكتابة</button>
          )}
          <button type="button" onClick={openModal} disabled={isGenerating} className="px-2.5 py-1 rounded border border-[#4a4027] text-xs text-[#c2b691] hover:text-[#efe6cf] disabled:opacity-40">سكريبت جديد</button>
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-gradient-to-b from-[#e3c66b] to-[#b8901f] text-[#0a0a0a] text-xs font-bold disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            <span>تصدير السكريبت Word</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-2.5 rounded border border-rose-800/60 bg-rose-950/40 text-rose-200 text-xs flex items-start justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={clearError}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="flex-1 overflow-auto custom-scrollbar">
        <article className="max-w-3xl mx-auto px-6 py-8">
          {/* Episode header */}
          <header className="text-center space-y-2 pb-6 border-b border-[#d4af37]/40">
            <input
              value={script.episode.programName}
              onChange={e => updateEpisode({ programName: e.target.value })}
              className="w-full bg-transparent text-center fs-28 font-bold text-[#d4af37] focus:outline-none"
            />
            <div className="flex items-center justify-center gap-2 font-['Dosis'] fs-18 font-bold tracking-widest text-[#efe6cf]" dir="ltr">
              <span>EPISODE</span>
              <input
                type="number"
                min={1}
                value={script.episode.episodeNumber}
                onChange={e => updateEpisode({ episodeNumber: Number(e.target.value) || 1 })}
                className="w-20 bg-transparent text-center text-[#d4af37] focus:outline-none"
              />
            </div>
            <input
              value={script.episode.dateText}
              onChange={e => updateEpisode({ dateText: e.target.value })}
              className="w-full bg-transparent text-center fs-13 text-[#c2b691] focus:outline-none"
            />
            <p className="fs-12 text-[#8a7f66]">عن مقال: {script.source.title} • المذيع الرئيسي: {PODCAST_SPEAKERS[script.episode.leadHost ?? DEFAULT_LEAD_HOST]}</p>
          </header>

          {/* Disclaimer (Zakaria) */}
          <section className="mt-6 p-4 rounded-lg border border-[#2e2817] bg-[#0a0a0a] flex items-start gap-3">
            <div className="w-28 flex-shrink-0 flex flex-col items-end gap-1 pt-1">
              <SpeakerBadge speaker="zakaria" />
              <span className="fs-10 text-[#8a7f66]">إخلاء المسؤولية</span>
            </div>
            <div className="flex-1 min-w-0">
              {/* Fixed text, not editable */}
              <p className="fs-14 leading-loose text-[#c2b691] px-2 py-1">{PODCAST_DISCLAIMER}</p>
            </div>
          </section>

          {script.segments.map(segment => <SegmentBlock key={segment.id} segment={segment} />)}
        </article>
      </div>
    </div>
  );
};
