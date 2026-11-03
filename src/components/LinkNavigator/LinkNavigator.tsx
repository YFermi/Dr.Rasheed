import React, { useState } from 'react';
import { useIdeaStore, getAllNodeList, findNodeById } from '../../store/useIdeaStore';
import { LinkType, IdeaNode, NodeStatus } from '../../types';
import { 
  Link2, 
  Plus, 
  Trash2, 
  Edit3, 
  ArrowDown, 
  Filter, 
  Sparkles, 
  Unlink, 
  CheckCircle2, 
  ArrowLeft,
  Search,
  ExternalLink,
  HelpCircle,
  AlertCircle
} from 'lucide-react';

export const LinkNavigator: React.FC = () => {
  const {
    treeData,
    selectedNodeId,
    selectNode,
    removeIdeaLink,
    openLinkModal,
    startLinkingMode,
    cancelLinkingMode,
    linkingMode,
    activeLinkHighlight,
    setActiveLinkHighlight,
  } = useIdeaStore();

  const [filterType, setFilterType] = useState<string>('all'); // all, supports, contradicts, extends, prerequisite, orphans
  const [filterAxis, setFilterAxis] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const allNodes = getAllNodeList(treeData);
  const allAxes = allNodes.filter(n => n.type === 'axis');

  // Extract all links
  const linksList: {
    source: IdeaNode;
    targetId: string;
    target: IdeaNode | null;
    type: LinkType;
    notes?: string;
  }[] = [];

  const connectedNodeIds = new Set<string>();

  allNodes.forEach(node => {
    node.linkedIdeas.forEach(link => {
      const target = findNodeById(treeData, link.targetId);
      linksList.push({
        source: node,
        targetId: link.targetId,
        target,
        type: link.type,
        notes: link.notes,
      });
      connectedNodeIds.add(node.id);
      connectedNodeIds.add(link.targetId);
    });
  });

  // Orphan ideas: ideas and axes with zero connections
  const orphanNodes = allNodes.filter(n => 
    (n.type === 'idea' || n.type === 'evidence' || n.type === 'question') && 
    !connectedNodeIds.has(n.id)
  );

  // Filter links
  const filteredLinks = linksList.filter(item => {
    // Type filter
    if (filterType !== 'all' && filterType !== 'orphans') {
      if (item.type !== filterType) return false;
    }

    // Axis filter
    if (filterAxis !== 'all') {
      const sourceParentAxis = allAxes.find(a => 
        a.id === item.source.id || (a.children && getAllNodeList(a).some(c => c.id === item.source.id))
      );
      const targetParentAxis = item.target ? allAxes.find(a => 
        a.id === item.target!.id || (a.children && getAllNodeList(a).some(c => c.id === item.target!.id))
      ) : null;

      if (sourceParentAxis?.id !== filterAxis && targetParentAxis?.id !== filterAxis) {
        return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSource = item.source.arabicLabel.toLowerCase().includes(q);
      const matchTarget = item.target?.arabicLabel.toLowerCase().includes(q) || false;
      const matchNotes = item.notes?.toLowerCase().includes(q) || false;
      if (!matchSource && !matchTarget && !matchNotes) return false;
    }

    return true;
  });

  const getStatusColorDot = (status: NodeStatus) => {
    switch (status) {
      case 'published': return 'bg-emerald-500';
      case 'draft': return 'bg-amber-400';
      case 'deferred': return 'bg-rose-500';
      case 'brainstorm': return 'bg-blue-400';
      case 'rejected': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getRelationshipConfig = (type: LinkType) => {
    switch (type) {
      case 'supports':
        return {
          label: 'يدعم (supports)',
          arrowColor: 'text-emerald-400',
          bgColor: 'bg-emerald-950/40',
          borderColor: 'border-emerald-600/40',
          badgeText: 'يدعم',
          symbol: '↓',
        };
      case 'contradicts':
        return {
          label: 'يناقض (contradicts)',
          arrowColor: 'text-rose-400',
          bgColor: 'bg-rose-950/40',
          borderColor: 'border-rose-600/40',
          badgeText: 'يناقض',
          symbol: '↓',
        };
      case 'extends':
        return {
          label: 'يوسع (extends)',
          arrowColor: 'text-blue-400',
          bgColor: 'bg-blue-950/40',
          borderColor: 'border-blue-600/40',
          badgeText: 'يوسع',
          symbol: '↓',
        };
      case 'prerequisite':
        return {
          label: 'مقدمة (prerequisite)',
          arrowColor: 'text-amber-400',
          bgColor: 'bg-amber-950/40',
          borderColor: 'border-amber-600/40',
          badgeText: 'مقدمة',
          symbol: '↓',
        };
    }
  };

  const handleCardClick = (sourceId: string, targetId: string) => {
    selectNode(sourceId);
    setActiveLinkHighlight({ sourceId, targetId });

    // Scroll Word preview to the linked node element if it exists
    const el = document.getElementById(`preview-node-${sourceId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCardHover = (sourceId: string, targetId: string) => {
    setActiveLinkHighlight({ sourceId, targetId });
  };

  const handleCardLeave = () => {
    setActiveLinkHighlight(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#171717] text-[#efe6cf] select-none text-right font-sans">
      
      {/* 1. Header with Count Badge */}
      <div className="h-10 px-3 bg-[#121212] border-b border-[#2e2817] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-indigo-400" />
          <span className="font-bold text-xs text-white">التشابكات</span>
          <span className="fs-10 font-mono bg-[#2e2817] text-[#d4af37] px-1.5 py-0.2 rounded-full border border-blue-900/40">
            {linksList.length}
          </span>
        </div>

        {linkingMode.active && (
          <button
            onClick={cancelLinkingMode}
            className="fs-10 bg-rose-950/80 text-rose-300 border border-rose-800 px-2 py-0.5 rounded animate-pulse"
          >
            إلغاء وضع الربط ✕
          </button>
        )}
      </div>

      {/* Linking Mode Active Banner */}
      {linkingMode.active && (
        <div className="p-2 bg-indigo-950/80 border-b border-indigo-700/60 text-indigo-200 fs-11 leading-tight space-y-1">
          <div className="flex items-center gap-1 font-bold text-white">
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span>وضع الربط التفاعلي نشط:</span>
          </div>
          <p className="fs-10 text-indigo-200/90 font-quran">
            {linkingMode.sourceId ? (
              <>انقر الآن على الفكرة الهدف (Target) في الشجرة لإتمام الربط.</>
            ) : (
              <>انقر على الفكرة الأصل (Source) في الشجرة، ثم الفكرة الهدف.</>
            )}
          </p>
        </div>
      )}

      {/* 2. Filter Bar */}
      <div className="p-2 bg-[#121212]/60 border-b border-[#2e2817] space-y-1.5">
        {/* Type & Axis Dropdowns */}
        <div className="flex items-center gap-1 fs-11">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2e2817] rounded px-1.5 py-1 text-white fs-10.5 flex-1 focus:outline-none"
          >
            <option value="all">كل العلاقات ({linksList.length})</option>
            <option value="supports">يدعم (supports)</option>
            <option value="contradicts">يناقض (contradicts)</option>
            <option value="extends">يوسع (extends)</option>
            <option value="prerequisite">مقدمة (prerequisite)</option>
            <option value="orphans">الأفكار المعزولة ({orphanNodes.length})</option>
          </select>

          <select
            value={filterAxis}
            onChange={(e) => setFilterAxis(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2e2817] rounded px-1.5 py-1 text-white fs-10.5 w-24 truncate focus:outline-none"
          >
            <option value="all">كل المحاور</option>
            {allAxes.map(ax => (
              <option key={ax.id} value={ax.id}>
                {ax.arabicLabel}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Search inside links */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في التشابكات..."
            className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-0.5 fs-10.5 text-white placeholder-gray-500 focus:outline-none font-sans"
          />
        </div>
      </div>

      {/* 3. Cards Scroll Area */}
      <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-2 text-xs">
        
        {/* VIEW A: ORPHAN IDEAS (Ideas with no links) */}
        {filterType === 'orphans' ? (
          <div className="space-y-2">
            <div className="p-2 bg-amber-950/20 border border-amber-900/40 rounded fs-10.5 text-amber-200 leading-tight">
              الأفكار التالية لا ترتبط بأي علاقة مع سائر الأفكار. انقر زر الربط لدمجها في الشبكة المعرفية:
            </div>
            {orphanNodes.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-xs font-quran">
                ممتاز! جميع أفكار البحث مترابطة ولا توجد أفكار معزولة.
              </div>
            ) : (
              orphanNodes.map(node => (
                <div
                  key={node.id}
                  className="p-2 bg-[#121212] border border-[#2e2817] rounded hover:border-amber-500/50 transition group"
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-quran font-bold text-xs text-gray-200 truncate">
                      {node.arabicLabel}
                    </span>
                    <span className={`w-2 h-2 rounded-full ${getStatusColorDot(node.status)}`} />
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#2e2817]/40 fs-10">
                    <span className="text-gray-400 font-mono">{node.type}</span>
                    <button
                      type="button"
                      onClick={() => startLinkingMode(node.id)}
                      className="px-2 py-0.5 bg-indigo-600/60 hover:bg-indigo-500 text-white rounded fs-10 flex items-center gap-1 transition"
                    >
                      <Link2 className="w-2.5 h-2.5" />
                      <span>ربط الآن</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          /* VIEW B: ACTIVE LINK CARDS */
          filteredLinks.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-xs font-quran">
              لا توجد تشابكات مطابقة للمحددات الحالية.
            </div>
          ) : (
            filteredLinks.map((item, idx) => {
              const rel = getRelationshipConfig(item.type);
              const isHighlighted = 
                activeLinkHighlight?.sourceId === item.source.id && 
                activeLinkHighlight?.targetId === item.targetId;

              return (
                <div
                  key={`${item.source.id}-${item.targetId}-${idx}`}
                  onClick={() => handleCardClick(item.source.id, item.targetId)}
                  onMouseEnter={() => handleCardHover(item.source.id, item.targetId)}
                  onMouseLeave={handleCardLeave}
                  className={`relative p-2.5 rounded-lg border transition-all cursor-pointer group select-none ${
                    isHighlighted
                      ? `${rel.bgColor} ring-2 ring-indigo-400 ${rel.borderColor} shadow-md`
                      : 'bg-[#121212] border-[#2e2817] hover:bg-[#171717] hover:border-[#4a4027]'
                  }`}
                >
                  {/* Action icons on hover */}
                  <div className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity z-10 bg-[#0a0a0a] p-0.5 rounded shadow">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLinkModal(item.source.id, item.targetId, item.type, item.notes, true);
                      }}
                      title="تعديل العلاقة"
                      className="p-1 hover:text-blue-400 text-gray-400 rounded"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('هل تريد حذف هذا الرابط بين الفكرتين؟')) {
                          removeIdeaLink(item.source.id, item.targetId);
                        }
                      }}
                      title="حذف الرابط"
                      className="p-1 hover:text-rose-400 text-gray-400 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 1. Source Idea (Top) */}
                  <div className="flex items-center gap-1.5 mb-1.5 pl-10">
                    <span 
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColorDot(item.source.status)}`} 
                      title={`حالة الفكرة: ${item.source.status}`}
                    />
                    <span className="font-quran font-bold text-xs text-white truncate flex-1" title={item.source.arabicLabel}>
                      {item.source.type === 'axis' ? '📐 ' : '💡 '}
                      {item.source.arabicLabel}
                    </span>
                  </div>

                  {/* 2. Arrow + Relationship Badge (Middle) */}
                  <div className="flex items-center gap-2 pr-3 my-1">
                    <span className={`font-mono text-xs font-bold ${rel.arrowColor}`}>
                      {rel.symbol}
                    </span>
                    <span className={`px-2 py-0.5 rounded fs-10 font-bold border ${rel.bgColor} ${rel.borderColor} ${rel.arrowColor}`}>
                      {rel.label}
                    </span>
                  </div>

                  {/* 3. Target Idea (Bottom) */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span 
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColorDot(item.target?.status || 'published')}`}
                      title={`حالة الهدف: ${item.target?.status || 'معلوم'}`}
                    />
                    <span className="font-quran font-bold text-xs text-gray-200 truncate flex-1" title={item.target?.arabicLabel || item.targetId}>
                      {item.target?.type === 'axis' ? '📐 ' : '💡 '}
                      {item.target ? item.target.arabicLabel : item.targetId}
                    </span>
                  </div>

                  {/* Optional Notes snippet */}
                  {item.notes && (
                    <p className="mt-1.5 pt-1 border-t border-[#2e2817]/50 fs-10 text-gray-400 font-quran line-clamp-1 italic">
                      "{item.notes}"
                    </p>
                  )}
                </div>
              );
            })
          )
        )}
      </div>

      {/* 4. Bottom Action: "+ New Link" */}
      <div className="p-2 bg-[#121212] border-t border-[#2e2817]">
        <button
          type="button"
          onClick={() => {
            if (selectedNodeId && selectedNodeId !== treeData.id) {
              startLinkingMode(selectedNodeId);
            } else {
              startLinkingMode();
            }
          }}
          className={`w-full py-1.5 rounded font-medium text-xs shadow-xs transition flex items-center justify-center gap-1.5 ${
            linkingMode.active
              ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{linkingMode.active ? 'وضع الربط مفعل (اختر الهدف)' : '+ رابط جديد (New Link)'}</span>
        </button>
      </div>

    </div>
  );
};
