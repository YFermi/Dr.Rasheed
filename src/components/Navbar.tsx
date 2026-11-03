import React, { useEffect } from 'react';
import { useIdeaStore, getAllNodeList } from '../store/useIdeaStore';
import { exportToWord } from '../utils/docxExport';
import { useArticleStore } from '../store/useArticleStore';
import { useApiKeyStore } from '../store/useApiKeyStore';
import { useReferenceStore } from '../store/useReferenceStore';
import {
  PenLine,
  FolderTree,
  Sparkles, 
  FileDown, 
  RotateCcw, 
  Printer, 
  Layers, 
  BookOpen, 
  Columns,
  Maximize2
} from 'lucide-react';

interface NavbarProps {
  onOpenImportModal: () => void;
  rightRatio: number;
  setRightRatio: (ratio: number) => void;
  showMidCol: boolean;
  setShowMidCol: (show: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ 
  onOpenImportModal, 
  rightRatio, 
  setRightRatio,
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

  const handleExportDocx = () => {
    exportToWord(treeData, projectSettings);
  };

  const handleReset = () => {
    if (window.confirm('هل تود استعادة البيانات النموذجية الأولية لقصة لوط؟ ستحل محل التعديلات غير المحفوظة.')) {
      resetToInitial();
    }
  };

  return (
    <header className="h-12 bg-[#11111b] border-b border-[#313244] px-4 flex items-center justify-between select-none text-[#cdd6f4] z-20">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-sm font-bold text-sm">
            📐
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-tight">
                باني الأفكار <span className="text-blue-400 font-mono text-xs">Idea Builder</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#313244] text-[#89b4fa] rounded-full border border-[#45475a] font-mono">
                RTL IDE
              </span>
            </div>
          </div>
        </div>

        <div className="h-4 w-px bg-[#313244] mx-1" />

        {/* Project Title */}
        <div className="hidden md:flex items-center gap-2 text-xs text-[#a6adc8]">
          <span className="text-gray-500">المشروع:</span>
          <span className="text-white font-quran font-semibold">{projectSettings.title}</span>
        </div>
      </div>

      {/* Center: Live Research Stats */}
      <div className="hidden xl:flex items-center gap-3 bg-[#181825] px-3 py-1 rounded-full border border-[#313244] text-[11px] text-[#a6adc8]">
        <span className="flex items-center gap-1">
          <span>📐</span>
          <span>{axesCount} محاور</span>
        </span>
        <span className="text-gray-600">•</span>
        <span className="flex items-center gap-1">
          <span>💡</span>
          <span>{ideasCount} فكرة</span>
        </span>
        <span className="text-gray-600">•</span>
        <span className="flex items-center gap-1">
          <span>📖</span>
          <span>{evidencesCount} شواهد</span>
        </span>
        <span className="text-gray-600">•</span>
        <span className="flex items-center gap-1">
          <span>❓</span>
          <span>{questionsCount} أسئلة</span>
        </span>
        <span className="text-gray-600">•</span>
        <span className="text-emerald-400 font-medium">
          {includedCount} عنصر بالوثيقة
        </span>
      </div>

      {/* Left/Right Actions */}
      <div className="flex items-center gap-2">
        {/* Mid Column Toggle */}
        <button
          onClick={() => setShowMidCol(!showMidCol)}
          title={showMidCol ? 'إخفاء العمود الأوسط (10%)' : 'إظهار العمود الأوسط (10%)'}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition ${
            showMidCol 
              ? 'bg-[#313244] text-blue-300 border-blue-800' 
              : 'bg-[#181825] text-gray-400 border-[#313244] hover:text-white'
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
          <span className="text-[11px] hidden sm:inline">العمود الأوسط</span>
        </button>

        {/* Layout Presets */}
        <div className="hidden sm:flex items-center gap-0.5 bg-[#181825] p-0.5 rounded border border-[#313244] text-[10px] font-mono">
          <button
            onClick={() => { setRightRatio(33); setShowMidCol(true); }}
            title="التوزيع النموذجي: 33% شجرة | 18% تبويبات | 49% مستند"
            className={`px-1.5 py-0.5 rounded transition ${rightRatio === 33 && showMidCol ? 'bg-[#313244] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
          >
            33:18:49
          </button>
          <button
            onClick={() => { setRightRatio(40); setShowMidCol(false); }}
            title="شجرة كاملة ومستند: 40% شجرة | 60% مستند"
            className={`px-1.5 py-0.5 rounded transition ${rightRatio === 40 && !showMidCol ? 'bg-[#313244] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
          >
            40:60
          </button>
          <button
            onClick={() => { setRightRatio(28); setShowMidCol(false); }}
            title="معاينة واسعة للمستند: 28% شجرة | 72% مستند"
            className={`px-1.5 py-0.5 rounded transition ${rightRatio === 28 && !showMidCol ? 'bg-[#313244] text-white font-bold' : 'text-gray-400 hover:text-white'}`}
          >
            28:72
          </button>
        </div>

        <button
          onClick={onOpenImportModal}
          title="استيراد وتفريغ جلسة عصف ذهني"
          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">استيراد نص عصف</span>
        </button>

        <button
          onClick={openReferenceModal}
          title="إدخال مقال سابق مكتمل وتحليله: تُضاف أفكاره للشجرة أفكاراً مرجعية"
          className="flex items-center gap-1.5 px-3 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded text-xs font-medium transition shadow-xs"
        >
          <span>📄 مقال مرجعي</span>
        </button>

        <button
          onClick={openGenerateModal}
          disabled={isGeneratingArticle}
          title="كتابة مقال نثري بأسلوب د. رشيد من شجرة الأفكار"
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white rounded text-xs font-semibold transition shadow-xs"
        >
          <PenLine className="w-3.5 h-3.5" />
          <span>{isGeneratingArticle ? 'جاري الكتابة...' : '✍️ كتابة المقال'}</span>
        </button>

        <button
          onClick={openKeyModal}
          title={
            hasKey ? 'مفتاح Gemini محفوظ في هذا المتصفح' :
            serverHasKey ? 'يُستعمل مفتاح الخادم — يمكنك إدخال مفتاحك' :
            'أدخل مفتاح Gemini API لتفعيل ميزات الذكاء الاصطناعي'
          }
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#181825] hover:bg-[#313244] border border-[#313244] text-[#cdd6f4] rounded text-xs transition"
        >
          <span className={`w-2 h-2 rounded-full ${hasKey ? 'bg-emerald-400' : serverHasKey ? 'bg-amber-400' : 'bg-rose-500'}`} />
          <span>{hasKey ? '🔑 المفتاح ✓' : serverHasKey ? '🔑 مفتاح الخادم' : '🔑 أدخل المفتاح'}</span>
        </button>

        <button
          onClick={handleExportDocx}
          title="تصدير المستند المنسق كملف Word"
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-xs font-semibold transition shadow-xs"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>تصدير Word</span>
        </button>

        <button
          onClick={handleReset}
          title="استعادة البيانات النموذجية لقصة لوط"
          className="p-1.5 hover:bg-[#313244] text-gray-400 hover:text-amber-300 rounded transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
