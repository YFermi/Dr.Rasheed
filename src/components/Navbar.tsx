import React, { useEffect, useState } from 'react';
import { useIdeaStore, getAllNodeList } from '../store/useIdeaStore';
import { exportArticleToWord } from '../utils/articleDocxExport';
import { useArticleStore } from '../store/useArticleStore';
import { useApiKeyStore } from '../store/useApiKeyStore';
import { useReferenceStore } from '../store/useReferenceStore';
import { SpiderWebLogo } from './SpiderWebLogo';
import {
  PenLine,
  FileDown,
  FilePlus2,
  Columns,
  Loader2,
} from 'lucide-react';

// Column widths in % of the window: idea tree | middle tabs | document
export const DEFAULT_COLUMN_RATIO = 22; // the tree and the middle column share one width
const LAYOUT_PRESETS = [
  { label: '22:22:56', right: DEFAULT_COLUMN_RATIO, mid: true, title: 'التوزيع النموذجي: الشجرة والعمود الأوسط بعرض واحد (22%) | 56% مستند' },
  { label: '30:70', right: 30, mid: false, title: 'شجرة ومستند: 30% شجرة | 70% مستند' },
  { label: '22:78', right: DEFAULT_COLUMN_RATIO, mid: false, title: 'معاينة واسعة للمستند: 22% شجرة | 78% مستند' },
];

interface NavbarProps {
  onOpenImportModal: () => void;
  rightRatio: number;
  setRightRatio: (ratio: number) => void;
  setMidRatio: (ratio: number) => void;
  showMidCol: boolean;
  setShowMidCol: (show: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenImportModal, 
  rightRatio, 
  setRightRatio,
  setMidRatio,
  showMidCol,
  setShowMidCol
}) => {
  const { 
    treeData, 
    projectSettings, 
    resetToInitial 
  } = useIdeaStore();

  const allNodes = getAllNodeList(treeData);
  const axesCount = allNodes.filter(n => n.type === 'axis').length;
  const ideasCount = allNodes.filter(n => n.type === 'idea').length;
  const evidencesCount = allNodes.filter(n => n.type === 'evidence').length;
  const questionsCount = allNodes.filter(n => n.type === 'question').length;
  const includedCount = allNodes.filter(n => n.includeInDoc && n.type !== 'project').length;

  const openGenerateModal = useArticleStore(state => state.openGenerateModal);
  const isGeneratingArticle = useArticleStore(state => state.isGenerating);
  const { hasKey, serverHasKey, openModal: openKeyModal, checkServerKey } = useApiKeyStore();
  const openReferenceModal = useReferenceStore(state => state.openModal);

  useEffect(() => {
    checkServerKey();
  }, [checkServerKey]);

  // Exports the written article (the draft), not the tree document; the tree's
  // own Word export stays in the document preview toolbar.
  const draft = useArticleStore(state => state.draft);
  const [isExporting, setIsExporting] = useState(false);
  const handleExportDocx = async () => {
    if (!draft) return;
    try {
      setIsExporting(true);
      await exportArticleToWord(draft, projectSettings.author);
    } finally {
      setIsExporting(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('هل تود البدء بمشروع جديد بشجرة فارغة؟ ستُحذف المحاور والأفكار الحالية من هذا المتصفح (احفظ المشروع كملف JSON أولاً إن أردت الاحتفاظ به).')) {
      resetToInitial();
    }
  };

  const outlineButton = 'flex items-center gap-1.5 px-3 py-1 bg-[#0a0a0a] hover:bg-[#1f1d18] border border-[#4a4027] hover:border-[#d4af37] text-[#efe6cf] rounded text-xs font-medium transition';

  return (
    <header className="h-12 bg-[#050505] border-b border-[#4a4027] px-4 flex items-center gap-2 select-none text-[#efe6cf] z-20">
      {/* 1. Brand */}
      <div
        className="flex items-center gap-2 ml-2 flex-shrink-0"
        title={projectSettings.title ? `المشروع: ${projectSettings.title}` : 'بيت العنكبوت'}
      >
        <div className="w-8 h-8 rounded-md bg-[#0a0a0a] border border-[#d4af37]/60 flex items-center justify-center text-[#d4af37] shadow-[0_0_12px_rgba(212,175,55,0.25)]">
          <SpiderWebLogo className="w-6 h-6" />
        </div>
        <span className="font-bold text-base text-[#d4af37] tracking-tight whitespace-nowrap">بيت العنكبوت</span>
      </div>

      <div className="h-5 w-px bg-[#2e2817] mx-1" />

      {/* 2–4. The workflow: reference article → brainstorm session → article */}
      <button
        onClick={openReferenceModal}
        title="إدخال مقال سابق مكتمل وتحليله: تُضاف أفكاره للشجرة أفكاراً مرجعية"
        className={outlineButton}
      >
        <span>📄 مقال مرجعي</span>
      </button>

      <button
        onClick={onOpenImportModal}
        title="استيراد وتفريغ جلسة عصف ذهني"
        className={outlineButton}
      >
        <span>✨ استيراد نص عصف</span>
      </button>

      <button
        onClick={openGenerateModal}
        disabled={isGeneratingArticle}
        title="كتابة مقال نثري بأسلوب د. رشيد من شجرة الأفكار"
        className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-b from-[#e3c66b] to-[#b8901f] hover:from-[#ecd99c] hover:to-[#c9a227] disabled:opacity-60 text-[#0a0a0a] rounded text-xs font-bold transition shadow-[0_0_10px_rgba(212,175,55,0.3)]"
      >
        <PenLine className="w-3.5 h-3.5" />
        <span>{isGeneratingArticle ? 'جاري الكتابة...' : '✍️ كتابة المقال'}</span>
      </button>

      {/* 5. Live research stats */}
      <div className="hidden xl:flex items-center gap-3 bg-[#0a0a0a] px-3 py-1 rounded-full border border-[#2e2817] text-[11px] text-[#c2b691] mx-1">
        <span>📐 {axesCount} محاور</span>
        <span className="text-[#4a4027]">•</span>
        <span>💡 {ideasCount} فكرة</span>
        <span className="text-[#4a4027]">•</span>
        <span>📖 {evidencesCount} شواهد</span>
        <span className="text-[#4a4027]">•</span>
        <span>❓ {questionsCount} أسئلة</span>
        <span className="text-[#4a4027]">•</span>
        <span className="text-[#d4af37] font-medium">{includedCount} عنصر بالوثيقة</span>
      </div>

      {/* 6. Word export of the written article */}
      <button
        onClick={handleExportDocx}
        disabled={!draft || isExporting}
        title={draft ? `تصدير المقال المكتوب «${draft.title}» كملف Word` : 'لا يوجد مقال مكتوب بعد — اكتب المقال أولاً (✍️ كتابة المقال)'}
        className="flex items-center gap-1.5 px-3 py-1 bg-[#0a0a0a] hover:bg-[#1f1d18] border border-[#d4af37] text-[#d4af37] disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs font-semibold transition"
      >
        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
        <span>تصدير Word</span>
      </button>

      {/* 7. New project (empty tree) */}
      <button
        onClick={handleReset}
        title="مشروع جديد (شجرة فارغة)"
        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0a0a0a] hover:bg-rose-950/60 border border-[#4a4027] hover:border-rose-500 text-[#c2b691] hover:text-rose-300 rounded text-xs transition"
      >
        <FilePlus2 className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">مشروع جديد</span>
      </button>

      {/* Settings: API key and layout (far left) */}
      <div className="flex-1" />

      <button
        onClick={openKeyModal}
        title={
          hasKey ? 'مفتاح Gemini محفوظ في هذا المتصفح' :
          serverHasKey ? 'يُستعمل مفتاح الخادم — يمكنك إدخال مفتاحك' :
          'أدخل مفتاح Gemini API لتفعيل ميزات الذكاء الاصطناعي'
        }
        className="flex items-center gap-1.5 px-2.5 py-1 bg-[#0a0a0a] hover:bg-[#1f1d18] border border-[#2e2817] text-[#efe6cf] rounded text-xs transition"
      >
        <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-emerald-400' : serverHasKey ? 'bg-amber-400' : 'bg-rose-500'}`} />
        <span>{hasKey ? '🔑 المفتاح ✓' : serverHasKey ? '🔑 مفتاح الخادم' : '🔑 أدخل المفتاح'}</span>
      </button>

      <button
        onClick={() => setShowMidCol(!showMidCol)}
        title={showMidCol ? 'إخفاء العمود الأوسط' : 'إظهار العمود الأوسط'}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${
          showMidCol
            ? 'bg-[#1f1d18] text-[#d4af37] border-[#4a4027]'
            : 'bg-[#0a0a0a] text-[#8a7f66] border-[#2e2817] hover:text-[#efe6cf]'
        }`}
      >
        <Columns className="w-3.5 h-3.5" />
      </button>

      <div className="hidden 2xl:flex items-center gap-0.5 bg-[#0a0a0a] p-0.5 rounded border border-[#2e2817] text-[10px]">
        {LAYOUT_PRESETS.map(preset => (
          <button
            key={preset.label}
            onClick={() => { setRightRatio(preset.right); setMidRatio(DEFAULT_COLUMN_RATIO); setShowMidCol(preset.mid); }}
            title={preset.title}
            className={`px-1.5 py-0.5 rounded transition ${rightRatio === preset.right && showMidCol === preset.mid ? 'bg-[#2e2817] text-[#d4af37] font-bold' : 'text-[#8a7f66] hover:text-[#efe6cf]'}`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </header>
  );
};
