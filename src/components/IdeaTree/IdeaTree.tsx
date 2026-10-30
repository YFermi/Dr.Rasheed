import React, { useState, useRef, useEffect } from 'react';
import { useIdeaStore, findNodeById } from '../../store/useIdeaStore';
import { IdeaNode, NodeType, NodeStatus } from '../../types';
import { ContextMenu } from '../ContextMenu';
import { 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  FolderPlus, 
  Sparkles, 
  Save, 
  Upload, 
  FileText, 
  Link2, 
  Layers, 
  Check, 
  Search,
  CheckSquare,
  Square,
  HelpCircle
} from 'lucide-react';

interface IdeaTreeProps {
  onOpenImportModal: () => void;
}

export const IdeaTree: React.FC<IdeaTreeProps> = ({ onOpenImportModal }) => {
  const {
    treeData,
    selectedNodeId,
    expandedNodeIds,
    clipboardNode,
    highlightedLinkedNodeIds,
    filterKeyword,
    selectNode,
    updateNode,
    toggleIncludeInDoc,
    toggleNodeExpand,
    expandAll,
    collapseAll,
    addChildNode,
    addSiblingNode,
    deleteNode,
    duplicateNode,
    moveNodeUp,
    moveNodeDown,
    cutNode,
    copyNode,
    pasteNode,
    reorderNode,
    setHighlightedLinks,
    setFilterKeyword,
    exportProjectJson,
    importProjectJson,
  } = useIdeaStore();

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: IdeaNode } | null>(null);

  // Drag and drop state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save project as JSON file
  const handleSaveProject = () => {
    const jsonStr = exportProjectJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `idea-builder-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Load project from JSON file
  const handleLoadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const success = importProjectJson(content);
        if (success) {
          alert('تم استيراد المشروع بنجاح!');
        } else {
          alert('تعذر قراءة ملف المشروع. تأكد من صحة الملف.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Node Type Icons
  const getNodeIcon = (type: NodeType) => {
    switch (type) {
      case 'project':
        return <span title="مشروع البحث (Root)" className="text-base">📚</span>;
      case 'axis':
        return <span title="محور رئيسي (Level 1 Axis)" className="text-sm">📐</span>;
      case 'idea':
        return <span title="فكرة فرعية (Level 2 Idea)" className="text-sm">💡</span>;
      case 'evidence':
        return <span title="شاهد قرآني / دليل (Level 3 Evidence)" className="text-sm">📖</span>;
      case 'question':
        return <span title="سؤال مفتوح (Level 4 Question)" className="text-sm">❓</span>;
      default:
        return <span className="text-sm">📄</span>;
    }
  };

  // Node Status Border Color (COMSOL left status border)
  const getStatusBorderClass = (status: NodeStatus) => {
    switch (status) {
      case 'published':
        return 'border-r-4 border-r-emerald-500'; // 🟢 Green = Published
      case 'draft':
        return 'border-r-4 border-r-amber-400'; // 🟡 Yellow = Draft
      case 'deferred':
        return 'border-r-4 border-r-rose-500'; // 🔴 Red = Deferred
      case 'brainstorm':
        return 'border-r-4 border-r-blue-400'; // 🔵 Blue = New from Brainstorm
      case 'rejected':
        return 'border-r-4 border-r-gray-500'; // ⚫ Gray = Rejected
      default:
        return 'border-r-4 border-r-transparent';
    }
  };

  const getStatusBadge = (status: NodeStatus) => {
    switch (status) {
      case 'published':
        return <span className="text-[10px] text-emerald-400" title="منشور">منشور</span>;
      case 'draft':
        return <span className="text-[10px] text-amber-400" title="مسودة">مسودة</span>;
      case 'deferred':
        return <span className="text-[10px] text-rose-400" title="مؤجل">مؤجل</span>;
      case 'brainstorm':
        return <span className="text-[10px] text-blue-400" title="جديد من العصف">عصف</span>;
      case 'rejected':
        return <span className="text-[10px] text-gray-400" title="مرفوض">مرفوض</span>;
    }
  };

  // Double click rename handler
  const handleStartRename = (node: IdeaNode) => {
    setEditingNodeId(node.id);
    setEditingText(node.arabicLabel);
  };

  const handleFinishRename = (nodeId: string) => {
    if (editingText.trim()) {
      updateNode(nodeId, { arabicLabel: editingText.trim() });
    }
    setEditingNodeId(null);
  };

  // State for Ctrl+drag linking
  const [isCtrlDrag, setIsCtrlDrag] = useState(false);
  const {
    linkingMode,
    startLinkingMode,
    openLinkModal,
    activeLinkHighlight,
    setActiveLinkHighlight,
    pulsingNodeId,
  } = useIdeaStore();

  const treeContainerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [svgCurvePath, setSvgCurvePath] = useState<string | null>(null);

  // Bring a newly added (pulsing) node into view
  useEffect(() => {
    if (pulsingNodeId) {
      nodeRefs.current.get(pulsingNodeId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pulsingNodeId]);

  // Recalculate SVG curve when activeLinkHighlight changes
  useEffect(() => {
    if (!activeLinkHighlight || !treeContainerRef.current) {
      setSvgCurvePath(null);
      return;
    }
    const { sourceId, targetId } = activeLinkHighlight;
    const sourceEl = nodeRefs.current.get(sourceId);
    const targetEl = nodeRefs.current.get(targetId);

    if (sourceEl && targetEl) {
      const containerRect = treeContainerRef.current.getBoundingClientRect();
      const sRect = sourceEl.getBoundingClientRect();
      const tRect = targetEl.getBoundingClientRect();

      const startX = sRect.left - containerRect.left + 14;
      const startY = sRect.top - containerRect.top + sRect.height / 2;
      const endX = tRect.left - containerRect.left + 14;
      const endY = tRect.top - containerRect.top + tRect.height / 2;

      const controlX = Math.min(startX, endX) - 30;
      const path = `M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`;
      setSvgCurvePath(path);
    } else {
      setSvgCurvePath(null);
    }
  }, [activeLinkHighlight, expandedNodeIds]);

  // Drag and drop handlers with Ctrl/Cmd key detection
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    setDraggedNodeId(id);
    setIsCtrlDrag(e.ctrlKey || e.metaKey);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedNodeId || draggedNodeId === id) return;

    const ctrlPressed = e.ctrlKey || e.metaKey;
    setIsCtrlDrag(ctrlPressed);

    if (ctrlPressed) {
      setDropTargetId(id);
      setDropPosition('inside');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height;

    let pos: 'before' | 'after' | 'inside' = 'inside';
    if (offsetY < height * 0.25) {
      pos = 'before';
    } else if (offsetY > height * 0.75) {
      pos = 'after';
    } else {
      pos = 'inside';
    }

    setDropTargetId(id);
    setDropPosition(pos);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const isLinkMode = e.ctrlKey || e.metaKey || isCtrlDrag;

    if (draggedNodeId && targetId && draggedNodeId !== targetId) {
      if (isLinkMode) {
        // Ctrl+Drop: Create link shortcut!
        openLinkModal(draggedNodeId, targetId, 'supports', '', false);
      } else if (dropPosition) {
        // Normal Drag: Reorder node
        reorderNode(draggedNodeId, targetId, dropPosition);
      }
    }

    setDraggedNodeId(null);
    setDropTargetId(null);
    setDropPosition(null);
    setIsCtrlDrag(false);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDropTargetId(null);
    setDropPosition(null);
    setIsCtrlDrag(false);
  };

  // Filter matching
  const doesNodeMatchFilter = (node: IdeaNode): boolean => {
    if (!filterKeyword.trim()) return true;
    const q = filterKeyword.toLowerCase();
    const matchThis = 
      node.arabicLabel.toLowerCase().includes(q) ||
      (node.notes && node.notes.toLowerCase().includes(q)) ||
      (node.quranicVerses && node.quranicVerses.toLowerCase().includes(q)) ||
      node.speakers.some(s => s.toLowerCase().includes(q));
    
    if (matchThis) return true;
    if (node.children) {
      return node.children.some(doesNodeMatchFilter);
    }
    return false;
  };

  // Render tree node recursive
  const renderTreeNode = (node: IdeaNode, depth: number) => {
    if (!doesNodeMatchFilter(node)) return null;

    const isExpanded = expandedNodeIds.includes(node.id);
    const isSelected = selectedNodeId === node.id;
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const childCount = node.children ? node.children.length : 0;
    const isLinkedHighlighted = highlightedLinkedNodeIds.includes(node.id);
    const hasLinks = node.linkedIdeas && node.linkedIdeas.length > 0;

    const isBeingEdited = editingNodeId === node.id;
    const isTarget = dropTargetId === node.id;

    const isLinkSource = activeLinkHighlight?.sourceId === node.id;
    const isLinkTarget = activeLinkHighlight?.targetId === node.id;
    const isPulsing = isLinkSource || isLinkTarget;
    const isNewlyAdded = pulsingNodeId === node.id;

    return (
      <div 
        key={node.id} 
        ref={(el) => {
          if (el) nodeRefs.current.set(node.id, el);
          else nodeRefs.current.delete(node.id);
        }}
        className="relative select-none text-right"
      >
        {/* Drop indicator: Before */}
        {isTarget && dropPosition === 'before' && !isCtrlDrag && (
          <div className="h-0.5 bg-blue-400 my-0.5 mx-2 rounded shadow-xs shadow-blue-400" />
        )}

        {/* Release to link tooltip during Ctrl drag */}
        {isTarget && isCtrlDrag && draggedNodeId !== node.id && (
          <div className="absolute right-6 top-1/2 -translate-y-1/2 z-30 bg-indigo-600 text-white font-sans text-[10px] px-2 py-0.5 rounded shadow-lg flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            <span>أفلت لإنشاء رابط (Release to link)</span>
          </div>
        )}

        <div
          draggable={node.type !== 'project'}
          onDragStart={(e) => handleDragStart(e, node.id)}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.id)}
          onDragEnd={handleDragEnd}
          onClick={(e) => {
            e.stopPropagation();
            if (linkingMode.active) {
              if (!linkingMode.sourceId) {
                startLinkingMode(node.id);
              } else if (linkingMode.sourceId !== node.id) {
                openLinkModal(linkingMode.sourceId, node.id, 'supports', '', false);
              }
              return;
            }
            selectNode(node.id);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            handleStartRename(node);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selectNode(node.id);
            setContextMenu({ x: e.clientX, y: e.clientY, node });
          }}
          onMouseEnter={() => {
            if (hasLinks) {
              setHighlightedLinks(node.linkedIdeas.map(l => l.targetId));
            }
          }}
          onMouseLeave={() => {
            setHighlightedLinks([]);
          }}
          style={{ paddingRight: `${Math.max(8, depth * 16 + 6)}px` }}
          className={`group flex items-center justify-between py-1 px-2 cursor-pointer transition-all text-xs font-sans rounded-xs ${
            getStatusBorderClass(node.status)
          } ${
            isPulsing
              ? 'bg-indigo-950/80 text-white font-bold ring-2 ring-indigo-400 shadow-lg animate-pulse'
              : isNewlyAdded
              ? 'bg-emerald-950/60 text-emerald-200 font-bold ring-2 ring-emerald-400 shadow-lg animate-pulse'
              : isSelected
              ? 'bg-[#313244] text-[#89b4fa] font-medium shadow-xs ring-1 ring-[#89b4fa]/30'
              : 'hover:bg-[#313244]/60 text-[#cdd6f4]'
          } ${
            isLinkedHighlighted && !isPulsing ? 'ring-2 ring-amber-400 bg-amber-950/20' : ''
          } ${
            isTarget && dropPosition === 'inside' && !isCtrlDrag ? 'bg-blue-900/40 ring-1 ring-blue-400' : ''
          } ${
            isTarget && isCtrlDrag ? 'bg-indigo-950/60 ring-2 ring-indigo-500' : ''
          }`}
        >
          {/* Right side: Expand toggle + Checkbox + Icon + Label */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* Expand / Collapse Chevron */}
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNodeExpand(node.id);
                }}
                className="w-4 h-4 flex items-center justify-center text-[#a6adc8] hover:text-white rounded hover:bg-[#45475a]/50 transition"
                title={isExpanded ? 'طي التفرع' : 'توسيع التفرع'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4" />
            )}

            {/* Include in Word Output Checkbox */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleIncludeInDoc(node.id);
              }}
              title={node.includeInDoc ? 'مدرج في مستند Word (انقر للاستثناء)' : 'مستثنى من مستند Word (انقر للتضمين)'}
              className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                node.includeInDoc
                  ? 'text-blue-400 hover:text-blue-300'
                  : 'text-gray-500 hover:text-gray-400 opacity-60'
              }`}
            >
              {node.includeInDoc ? (
                <CheckSquare className="w-3.5 h-3.5" />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Level Icon */}
            <span className="flex-shrink-0 select-none">
              {getNodeIcon(node.type)}
            </span>

            {/* Label or Inline Input */}
            {isBeingEdited ? (
              <input
                type="text"
                value={editingText}
                autoFocus
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => handleFinishRename(node.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFinishRename(node.id);
                  if (e.key === 'Escape') setEditingNodeId(null);
                }}
                className="bg-[#181825] border border-blue-500 text-white px-1.5 py-0.5 rounded text-xs w-full focus:outline-none"
              />
            ) : (
              <span 
                className={`truncate font-quran text-[13px] ${
                  !node.includeInDoc ? 'line-through opacity-50' : ''
                }`}
                title={node.arabicLabel}
              >
                {node.arabicLabel}
              </span>
            )}
          </div>

          {/* Left side: Links icon + child count badge + status */}
          <div className="flex items-center gap-1.5 flex-shrink-0 mr-2 text-[11px] font-sans">
            {/* Linked ideas chain icon */}
            {hasLinks && (
              <span 
                title={`أفكار مرتبطة (${node.linkedIdeas.length})`}
                className="text-amber-400 bg-amber-950/40 px-1 py-0.2 rounded flex items-center gap-0.5"
              >
                <Link2 className="w-3 h-3" />
                <span className="text-[10px]">{node.linkedIdeas.length}</span>
              </span>
            )}

            {/* Child count badge */}
            {childCount > 0 && (
              <span 
                className="px-1.5 py-0.2 bg-[#181825] text-[#a6adc8] rounded-full text-[10px] font-mono border border-[#313244]"
                title={`العناصر التابعة: ${childCount}`}
              >
                {childCount}
              </span>
            )}

            {/* Status indicator text */}
            <span className="opacity-80 font-mono text-[10px]">
              {getStatusBadge(node.status)}
            </span>
          </div>
        </div>

        {/* Drop indicator: After */}
        {isTarget && dropPosition === 'after' && (
          <div className="h-0.5 bg-blue-400 my-0.5 mx-2 rounded shadow-xs shadow-blue-400" />
        )}

        {/* Render Children if expanded */}
        {hasChildren && isExpanded && (
          <div className="border-r border-[#313244]/40 mr-2">
            {node.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e] text-[#cdd6f4] border-l border-[#313244] select-none">
      {/* Hidden File Input for loading project */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLoadFile}
        accept=".json"
        className="hidden"
      />

      {/* Tree Panel Header & COMSOL Title */}
      <div className="h-10 px-3 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#89b4fa]" />
          <span className="font-semibold text-xs tracking-wide text-[#cdd6f4]">
            IDEA BUILDER (باني الأفكار الهيكلي)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => collapseAll()}
            title="طي كافة العناصر"
            className="p-1 hover:bg-[#313244] rounded text-[#a6adc8] hover:text-white transition"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-90" />
          </button>
          <button
            onClick={() => expandAll()}
            title="توسيع كافة العناصر"
            className="p-1 hover:bg-[#313244] rounded text-[#a6adc8] hover:text-white transition"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* COMSOL Model Builder Toolbar */}
      <div className="p-2 border-b border-[#313244] bg-[#1e1e2e] flex flex-wrap items-center gap-1 text-xs">
        <button
          onClick={() => addChildNode(selectedNodeId || 'root-project', 'axis')}
          title="إضافة محور رئيسي جديد (Axis)"
          className="flex items-center gap-1 px-2 py-1 bg-[#313244] hover:bg-[#45475a] text-blue-300 rounded transition font-medium text-[11px]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ محور</span>
        </button>

        <button
          onClick={() => addChildNode(selectedNodeId || 'root-project', 'idea')}
          title="إضافة فكرة فرعية تابعة (Idea)"
          className="flex items-center gap-1 px-2 py-1 bg-[#313244] hover:bg-[#45475a] text-amber-300 rounded transition font-medium text-[11px]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>+ فكرة</span>
        </button>

        <div className="h-4 w-px bg-[#45475a] mx-0.5" />

        <button
          onClick={() => moveNodeUp(selectedNodeId)}
          title="تحريك العنصر للأعلى"
          className="p-1.5 hover:bg-[#313244] text-[#a6adc8] hover:text-white rounded transition"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => moveNodeDown(selectedNodeId)}
          title="تحريك العنصر للأسفل"
          className="p-1.5 hover:bg-[#313244] text-[#a6adc8] hover:text-white rounded transition"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            if (window.confirm('هل تريد حذف العنصر المحدد؟')) {
              deleteNode(selectedNodeId);
            }
          }}
          disabled={selectedNodeId === treeData.id}
          title="حذف العنصر المحدد"
          className="p-1.5 hover:bg-rose-950/60 text-rose-400 rounded transition disabled:opacity-30"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-[#45475a] mx-0.5" />

        <button
          onClick={onOpenImportModal}
          title="استيراد وتفكيك نص العصف الذهني بالذكاء الاصطناعي"
          className="flex items-center gap-1 px-2 py-1 bg-indigo-900/50 hover:bg-indigo-800/70 border border-indigo-700/60 text-indigo-200 rounded transition text-[11px] font-medium"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>📥 استيراد نص عصف</span>
        </button>

        <div className="flex-1" />

        <button
          onClick={handleSaveProject}
          title="حفظ المشروع كملف JSON"
          className="p-1.5 hover:bg-[#313244] text-emerald-400 hover:text-emerald-300 rounded transition"
        >
          <Save className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          title="فتح ملف مشروع محفوظ"
          className="p-1.5 hover:bg-[#313244] text-sky-400 hover:text-sky-300 rounded transition"
        >
          <Upload className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Search Filter */}
      <div className="px-2 py-1.5 bg-[#181825]/60 border-b border-[#313244] flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={filterKeyword}
          onChange={(e) => setFilterKeyword(e.target.value)}
          placeholder="بحث سريع في عناصر الشجرة والآيات..."
          className="bg-transparent text-xs text-[#cdd6f4] placeholder-gray-500 w-full focus:outline-none font-sans"
        />
        {filterKeyword && (
          <button
            onClick={() => setFilterKeyword('')}
            className="text-[10px] text-gray-400 hover:text-white px-1"
          >
            مسح
          </button>
        )}
      </div>

      {/* Tree Content Area with SVG Connection Curve Overlay */}
      <div 
        ref={treeContainerRef}
        className="flex-1 overflow-auto custom-scrollbar p-1 space-y-0.5 relative"
        onClick={() => setContextMenu(null)}
      >
        {/* SVG Visual Connection Curve */}
        {svgCurvePath && (
          <svg className="absolute inset-0 pointer-events-none w-full h-full z-20 overflow-visible">
            <defs>
              <marker
                id="link-arrow"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#818cf8" />
              </marker>
            </defs>
            <path
              d={svgCurvePath}
              fill="none"
              stroke="#818cf8"
              strokeWidth="2.5"
              strokeDasharray="4 3"
              className="animate-pulse"
              markerEnd="url(#link-arrow)"
            />
          </svg>
        )}

        {renderTreeNode(treeData, 0)}
      </div>

      {/* Status Bar Legend */}
      <div className="h-6 px-3 bg-[#181825] border-t border-[#313244] flex items-center justify-between text-[10px] text-[#a6adc8] font-sans">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> منشور
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span> مسودة
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> مؤجل
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400"></span> عصف
          </span>
        </div>
        <div>
          <span>اسحب وأفلت لإعادة الترتيب • نقر مزدوج للتسمية</span>
        </div>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={() => setContextMenu(null)}
          onAddChild={() => addChildNode(contextMenu.node.id)}
          onAddSibling={() => addSiblingNode(contextMenu.node.id)}
          onDelete={() => deleteNode(contextMenu.node.id)}
          onDuplicate={() => duplicateNode(contextMenu.node.id)}
          onMoveUp={() => moveNodeUp(contextMenu.node.id)}
          onMoveDown={() => moveNodeDown(contextMenu.node.id)}
          onCut={() => cutNode(contextMenu.node.id)}
          onCopy={() => copyNode(contextMenu.node.id)}
          onPaste={() => pasteNode(contextMenu.node.id)}
          onToggleInclude={() => toggleIncludeInDoc(contextMenu.node.id)}
          hasClipboard={Boolean(clipboardNode)}
        />
      )}
    </div>
  );
};
