import React, { useRef } from 'react';
import { useIdeaStore } from '../../store/useIdeaStore';
import { exportToWord } from '../../utils/docxExport';
import { IdeaNode } from '../../types';
import { 
  FileDown, 
  Printer, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  BookOpen, 
  CheckSquare, 
  Eye, 
  Sparkles,
  Info
} from 'lucide-react';

export const WordPreview: React.FC = () => {
  const { 
    treeData, 
    projectSettings, 
    wordPreviewZoom, 
    setWordPreviewZoom,
    selectedNodeId,
    selectNode
  } = useIdeaStore();

  const [isExporting, setIsExporting] = React.useState(false);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const handleExportDocx = async () => {
    try {
      setIsExporting(true);
      await exportToWord(treeData, projectSettings);
    } catch (e) {
      console.error('Export error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter only included nodes
  const renderDocumentNodes = (node: IdeaNode, depth: number) => {
    if (!node.includeInDoc) return null;

    const isSelected = node.id === selectedNodeId;

    return (
      <div 
        key={node.id} 
        id={`preview-node-${node.id}`}
        onClick={() => selectNode(node.id)}
        className={`group relative transition-all rounded px-2 py-1 my-1 cursor-pointer ${
          isSelected 
            ? 'ring-2 ring-blue-500/50 bg-blue-50/40' 
            : 'hover:bg-amber-50/40'
        }`}
      >
        {/* Axis / Heading 1 */}
        {node.type === 'axis' && (
          <div className="mt-6 mb-2 border-b border-blue-900/15 pb-1">
            <h2 className="text-[21px] font-bold text-[#1e3a8a] leading-tight font-quran flex items-center justify-between">
              <span>{node.arabicLabel}</span>
              <span className="text-[11px] font-sans font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full no-print">
                محور رئيسي
              </span>
            </h2>
          </div>
        )}

        {/* Idea / Heading 2 */}
        {node.type === 'idea' && (
          <div className="mt-4 mb-2">
            <h3 className="text-[17px] font-bold text-[#374151] leading-snug font-quran flex items-center gap-2">
              <span className="text-amber-600 text-xs font-mono">●</span>
              <span>{node.arabicLabel}</span>
            </h3>
          </div>
        )}

        {/* Evidence / الشاهد */}
        {node.type === 'evidence' && (
          <div className="mt-2 mb-1 flex items-center gap-2 text-[14px] font-semibold text-[#854d0e] font-quran">
            <span className="text-sm">📖</span>
            <span>الشاهد: {node.arabicLabel}</span>
          </div>
        )}

        {/* Question / مسألة بحثية */}
        {node.type === 'question' && (
          <div className="mt-3 mb-1 p-2 bg-sky-50/80 border-r-4 border-sky-600 rounded text-[14px] font-medium text-[#0369a1] font-quran flex items-start gap-2">
            <span className="text-base leading-none">❓</span>
            <div>
              <span className="font-bold">مسألة بحثية مفتوحة: </span>
              <span>{node.arabicLabel}</span>
            </div>
          </div>
        )}

        {/* Quranic Verse Box */}
        {node.quranicVerses && node.quranicVerses.trim() && (
          <div className="my-3 mx-2 p-3.5 bg-[#fef9c3]/90 border-y border-[#ca8a04]/40 border-r-4 border-r-[#ca8a04] rounded-lg shadow-xs text-center relative overflow-hidden">
            <div className="absolute top-1 left-2 text-[10px] text-amber-800/60 font-sans tracking-wider uppercase font-semibold">
              شاهد قرآني
            </div>
            <p className="font-quran text-[18px] md:text-[19px] text-[#78350f] font-bold leading-relaxed tracking-wide selection:bg-amber-200">
              {node.quranicVerses}
            </p>
          </div>
        )}

        {/* Body Notes */}
        {node.notes && node.notes.trim() && (
          <p className="text-[15px] text-[#1f2937] leading-[1.85] text-justify font-quran whitespace-pre-wrap my-1.5 px-1">
            {node.notes}
          </p>
        )}

        {/* Footnote-like metadata tags */}
        {(node.speakers.length > 0 || node.crossReferences.length > 0 || node.sessionRef) && node.type !== 'project' && (
          <div className="mt-1 mb-2 pt-1 border-t border-gray-100 flex flex-wrap items-center gap-2 text-[11.5px] text-gray-500 font-sans">
            {node.speakers.length > 0 && (
              <span className="bg-gray-100/90 text-gray-700 px-1.5 py-0.5 rounded">
                المتحدث: {node.speakers.join('، ')}
              </span>
            )}
            {node.crossReferences.length > 0 && (
              <span className="bg-amber-50 text-amber-900 border border-amber-200/60 px-1.5 py-0.5 rounded font-mono text-[10.5px]">
                شواهد: {node.crossReferences.join(' | ')}
              </span>
            )}
            {node.sessionRef && (
              <span className="text-gray-400">
                مرجع: {node.sessionRef}
              </span>
            )}
            {node.linkedIdeas.length > 0 && (
              <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] font-sans">
                🔗 مرتبط بـ {node.linkedIdeas.length} أفكار
              </span>
            )}
          </div>
        )}

        {/* Recursively render children */}
        {node.children && node.children.map(child => renderDocumentNodes(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#e5e7eb] select-text">
      {/* Top Document Toolbar */}
      <div className="h-11 bg-white border-b border-gray-300 px-4 flex items-center justify-between shadow-xs no-print select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-blue-900 font-bold text-sm">
            <BookOpen className="w-4 h-4 text-blue-700" />
            <span>معاينة مستند Word (A4)</span>
          </div>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
            العرض الحي RTL
          </span>
        </div>

        {/* Center / Zoom & View Controls */}
        <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200 text-xs text-gray-700">
          <button 
            onClick={() => setWordPreviewZoom(Math.max(60, wordPreviewZoom - 10))}
            title="تصغير المعاينة"
            className="p-1 hover:bg-white rounded transition text-gray-600"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-10 text-center font-mono font-medium text-xs">
            {wordPreviewZoom}%
          </span>
          <button 
            onClick={() => setWordPreviewZoom(Math.min(150, wordPreviewZoom + 10))}
            title="تكبير المعاينة"
            className="p-1 hover:bg-white rounded transition text-gray-600"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setWordPreviewZoom(100)}
            title="إعادة ضبط القياس 100%"
            className="px-1.5 py-0.5 hover:bg-white rounded text-[11px] text-gray-600 border-r border-gray-300 mr-1"
          >
            100%
          </button>
        </div>

        {/* Right / Export Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            title="طباعة أو تصدير بصيغة PDF"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded shadow-xs active:scale-95 transition"
          >
            <Printer className="w-3.5 h-3.5 text-gray-600" />
            <span>طباعة / PDF</span>
          </button>
          <button
            onClick={handleExportDocx}
            disabled={isExporting}
            title="تصدير ملف Word حقيقي منسق بالكامل"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-xs active:scale-95 transition disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>{isExporting ? 'جاري التصدير...' : 'تصدير Word (.docx)'}</span>
          </button>
        </div>
      </div>

      {/* MS Word-style Metric Ruler Bar */}
      <div className="h-6 bg-[#f3f4f6] border-b border-gray-300 flex items-center justify-center text-[10px] text-gray-500 font-mono select-none overflow-hidden no-print">
        <div 
          className="flex items-center border-l border-r border-gray-400 bg-white shadow-inner h-4 relative"
          style={{ width: `${(794 * wordPreviewZoom) / 100}px` }}
        >
          {/* Margin markers on left & right */}
          <div className="absolute left-0 top-0 bottom-0 w-[96px] bg-gray-200/80 border-r border-gray-400 flex items-center justify-center text-[9px] text-gray-600">
            2.54cm
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-[96px] bg-gray-200/80 border-l border-gray-400 flex items-center justify-center text-[9px] text-gray-600">
            2.54cm
          </div>
          {/* Centimeter ticks */}
          <div className="w-full flex justify-between px-[96px]">
            {Array.from({ length: 16 }).map((_, i) => (
              <span key={i} className="flex flex-col items-center">
                <span className="h-1.5 w-px bg-gray-400"></span>
                <span className="text-[8px] leading-none text-gray-500">{i + 1}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable A4 Document View Area */}
      <div className="flex-1 overflow-auto word-scrollbar p-6 lg:p-10 flex flex-col items-center">
        <div 
          ref={pageContainerRef}
          style={{
            transform: `scale(${wordPreviewZoom / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 150ms ease-out',
          }}
          className="relative bg-white shadow-2xl ring-1 ring-black/10 rounded-xs a4-page-print w-[794px] min-h-[1123px] p-[96px] text-right text-gray-900 mb-12"
        >
          {/* Running Header */}
          <div className="border-b border-gray-200 pb-2 mb-8 flex items-center justify-between text-[11px] text-gray-400 font-quran">
            <span>{projectSettings.title}</span>
            <span>باني الأفكار — دراسة استقرائية وتفكيك دلالي</span>
          </div>

          {/* Document Title Header */}
          <div className="text-center mb-8">
            <h1 className="text-[28px] font-bold text-[#1e3a8a] font-quran tracking-tight mb-2">
              {projectSettings.title}
            </h1>
            {projectSettings.subtitle && (
              <p className="text-[15px] text-gray-600 font-quran italic mb-3">
                {projectSettings.subtitle}
              </p>
            )}
            <div className="inline-flex items-center gap-3 text-[12px] text-gray-500 font-sans border-y border-blue-100 py-1 px-4 bg-blue-50/30 rounded">
              <span><strong>الباحث / الفريق:</strong> {projectSettings.author}</span>
              <span>•</span>
              <span><strong>التاريخ:</strong> {projectSettings.date}</span>
            </div>
          </div>

          {/* Document Abstract / Overview */}
          {projectSettings.description && (
            <div className="p-4 bg-gray-50 border-r-3 border-blue-600 rounded mb-6 text-[13.5px] leading-relaxed text-gray-700 font-quran">
              <strong className="text-blue-900 block mb-1">توطئة ومنهجية البحث:</strong>
              {projectSettings.description}
            </div>
          )}

          {/* Render All Tree Nodes */}
          <div className="space-y-2">
            {renderDocumentNodes(treeData, 0)}
          </div>

          {/* Running Footer */}
          <div className="mt-16 pt-4 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-400 font-sans">
            <span>تم استخراج المستند عبر نظام Idea Builder</span>
            <div className="flex items-center gap-1 font-mono">
              <span>صفحة 1 من 1</span>
              <span>•</span>
              <span>{projectSettings.date}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
