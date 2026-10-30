import React, { useState, useRef, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { WordPreview } from './components/WordPreview/WordPreview';
import { IdeaTree } from './components/IdeaTree/IdeaTree';
import { MiddleTabPanel } from './components/MiddleColumn/MiddleTabPanel';
import { LinkModal } from './components/LinkNavigator/LinkModal';
import { ScriptImportModal } from './components/ScriptImportModal/ScriptImportModal';
import { BlogReader } from './components/Blog/BlogReader';
import { ArticleDraftView } from './components/ArticleDraft/ArticleDraftView';
import { ArticleGenerateModal } from './components/ArticleDraft/ArticleGenerateModal';
import { ApiKeyModal } from './components/ApiKeyModal';
import { useIdeaStore } from './store/useIdeaStore';
import { useBlogStore } from './store/useBlogStore';
import { useArticleStore } from './store/useArticleStore';
import { FileText, BookOpen, PenLine, Loader2 } from 'lucide-react';
import { toArabicDigits } from './utils/arabic';

export default function App() {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Layout Ratios (RTL Workflow: Right 30-35%, Middle 15-20%, Left 50-55%)
  const [rightRatio, setRightRatio] = useState(33); // 33% Idea Builder (Right side - FULL HEIGHT)
  const [midRatio, setMidRatio] = useState(18);     // 18% Middle Tabbed Column (min 240px, max 360px)
  const [showMidCol, setShowMidCol] = useState(true);

  // Resizing states
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingMid, setIsDraggingMid] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Left panel: Word preview or blog article reader
  const leftPanelView = useBlogStore(state => state.leftPanelView);
  const setLeftPanelView = useBlogStore(state => state.setLeftPanelView);
  const openArticlePart = useBlogStore(state =>
    state.corpus?.articles.find(a => a.id === state.openArticleId)?.partNumber
  );
  const isGeneratingArticle = useArticleStore(state => state.isGenerating);
  const hasStaleSections = useArticleStore(state => Object.values(state.sectionMeta).some(m => m.stale));

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      // Dragging divider between Right Column (Tree) and Middle Column (Tabs)
      if (isDraggingRight) {
        // In RTL: right panel width = rect.right - e.clientX
        const rightWidth = rect.right - e.clientX;
        const percent = Math.min(Math.max((rightWidth / rect.width) * 100, 25), 45);
        setRightRatio(Math.round(percent));
      }

      // Dragging divider between Middle Column (Tabs) and Left (Word Preview)
      if (isDraggingMid && showMidCol) {
        const rightColPx = rect.width * (rightRatio / 100);
        const midWidth = (rect.right - rightColPx) - e.clientX;
        const percent = Math.min(Math.max((midWidth / rect.width) * 100, 12), 28);
        setMidRatio(Math.round(percent));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingRight(false);
      setIsDraggingMid(false);
    };

    if (isDraggingRight || isDraggingMid) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRight, isDraggingMid, rightRatio, showMidCol]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#181825] overflow-hidden text-[#cdd6f4]">
      {/* Top Application Navbar */}
      <Navbar
        onOpenImportModal={() => setIsImportModalOpen(true)}
        rightRatio={rightRatio}
        setRightRatio={setRightRatio}
        showMidCol={showMidCol}
        setShowMidCol={setShowMidCol}
      />

      {/* 
        3-PANEL RTL WORKSPACE:
        Under <html dir="rtl">, flex items flow from RIGHT to LEFT:
        1. Panel 1 (Right, 30-35%): IDEA BUILDER TREE ONLY (100% FULL HEIGHT)
        2. Resizer 1 (Draggable divider)
        3. Panel 2 (Middle, 15-20%, min 240px, max 360px): TABBED INFORMATION PANEL (التشابكات | الخصائص | الآيات | الإحصائيات)
        4. Resizer 2 (Draggable divider)
        5. Panel 3 (Left, 50-55%): WORD DOCUMENT PREVIEW (A4)
      */}
      <div 
        ref={containerRef}
        className="flex-1 flex overflow-hidden relative select-none"
      >
        {/* PANEL 1 (RIGHT SIDE, 30-35%): IDEA BUILDER TREE ONLY (FULL HEIGHT) */}
        <div 
          style={{ width: `${rightRatio}%` }}
          className="h-full flex flex-col flex-shrink-0 overflow-hidden relative bg-[#1e1e2e] z-10"
        >
          <IdeaTree onOpenImportModal={() => setIsImportModalOpen(true)} />
        </div>

        {/* Resizer 1: Draggable divider between Idea Builder and Middle Column */}
        <div
          onMouseDown={() => setIsDraggingRight(true)}
          title="اسحب لتعديل عرض شجرة الأفكار"
          className="w-1.5 hover:w-2 bg-[#313244] hover:bg-[#89b4fa] cursor-col-resize flex items-center justify-center transition-all z-20 group"
        >
          <div className="w-0.5 h-8 bg-gray-500 group-hover:bg-white rounded" />
        </div>

        {/* PANEL 2 (MIDDLE COLUMN, 15-20%, min 240px, max 360px): TABBED INFORMATION PANEL */}
        {showMidCol && (
          <>
            <div 
              style={{ width: `${midRatio}%` }}
              className="h-full flex-shrink-0 min-w-[240px] max-w-[360px] overflow-hidden relative bg-[#252536] border-l border-r border-[#313244] z-10"
            >
              <MiddleTabPanel />
            </div>

            {/* Resizer 2: Draggable divider between Middle Column and Word Preview */}
            <div
              onMouseDown={() => setIsDraggingMid(true)}
              title="اسحب لتعديل عرض لوحة المعلومات"
              className="w-1.5 hover:w-2 bg-[#313244] hover:bg-[#89b4fa] cursor-col-resize flex items-center justify-center transition-all z-20 group"
            >
              <div className="w-0.5 h-8 bg-gray-500 group-hover:bg-white rounded" />
            </div>
          </>
        )}

        {/* PANEL 3 (LEFT SIDE, 50-55%): WORD DOCUMENT PREVIEW (A4) or BLOG ARTICLE READER */}
        <div className="h-full flex-1 overflow-hidden relative flex flex-col">
          {/* Document / Article view switch */}
          <div className="h-8 bg-[#f3f4f6] border-b border-gray-300 flex items-stretch text-xs no-print select-none flex-shrink-0">
            <button
              type="button"
              onClick={() => setLeftPanelView('document')}
              title="معاينة مستند Word"
              className={`px-4 flex items-center gap-1.5 transition ${
                leftPanelView === 'document'
                  ? 'bg-white text-blue-800 font-bold border-b-2 border-blue-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>المستند</span>
            </button>
            <button
              type="button"
              onClick={() => setLeftPanelView('blog')}
              title="قراءة مقالات د. رشيد"
              className={`px-4 flex items-center gap-1.5 transition border-r border-gray-300 ${
                leftPanelView === 'blog'
                  ? 'bg-white text-blue-800 font-bold border-b-2 border-blue-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>المقال</span>
              {openArticlePart !== undefined && (
                <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-1.5 rounded-full">
                  {toArabicDigits(openArticlePart)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setLeftPanelView('draft')}
              title="مسودة المقال المولّدة من الشجرة"
              className={`px-4 flex items-center gap-1.5 transition border-r border-gray-300 ${
                leftPanelView === 'draft'
                  ? 'bg-white text-blue-800 font-bold border-b-2 border-blue-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
              }`}
            >
              <PenLine className="w-3.5 h-3.5" />
              <span>المسودة</span>
              {isGeneratingArticle && <Loader2 className="w-3 h-3 animate-spin text-blue-600" />}
              {!isGeneratingArticle && hasStaleSections && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="محاور قديمة في المسودة" />
              )}
            </button>
          </div>

          <div className="flex-1 overflow-hidden relative">
            {leftPanelView === 'blog' ? <BlogReader /> : leftPanelView === 'draft' ? <ArticleDraftView /> : <WordPreview />}
          </div>
        </div>
      </div>

      {/* Interactive Link Creation / Editing Modal */}
      <LinkModal />

      {/* Script Import & AI Extraction Modal */}
      <ScriptImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      {/* Article generation options */}
      <ArticleGenerateModal />

      {/* Anthropic API key (stacked above the other modals) */}
      <ApiKeyModal />
    </div>
  );
}
