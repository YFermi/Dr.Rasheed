import React, { useState } from 'react';
import { useIdeaStore, getAllNodeList, findNodeById } from '../../store/useIdeaStore';
import { 
  Link2, 
  BookMarked, 
  Users, 
  Network, 
  Sparkles, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ChevronLeft,
  Search,
  Filter
} from 'lucide-react';
import { IdeaNode, LinkType } from '../../types';

interface MiddleColumnProps {
  onSelectNode: (id: string) => void;
}

export const MiddleColumn: React.FC<MiddleColumnProps> = ({ onSelectNode }) => {
  const { 
    treeData, 
    selectedNodeId, 
    selectNode, 
    setHighlightedLinks 
  } = useIdeaStore();

  const [activeTab, setActiveTab] = useState<'links' | 'verses' | 'speakers' | 'outline'>('links');

  const allNodes = getAllNodeList(treeData);
  const selectedNode = findNodeById(treeData, selectedNodeId) || treeData;

  // Extract all links across the entire tree
  const allLinks: { source: IdeaNode; targetId: string; type: LinkType; notes?: string }[] = [];
  allNodes.forEach(node => {
    node.linkedIdeas.forEach(link => {
      allLinks.push({
        source: node,
        targetId: link.targetId,
        type: link.type,
        notes: link.notes
      });
    });
  });

  // Extract all Quranic verses mentioned
  const allVerses: { node: IdeaNode; verse: string }[] = [];
  allNodes.forEach(node => {
    if (node.quranicVerses && node.quranicVerses.trim()) {
      allVerses.push({
        node,
        verse: node.quranicVerses.trim(),
      });
    }
  });

  // Extract all speakers and counts
  const speakerMap = new Map<string, IdeaNode[]>();
  allNodes.forEach(node => {
    node.speakers.forEach(spk => {
      if (!speakerMap.has(spk)) speakerMap.set(spk, []);
      speakerMap.get(spk)!.push(node);
    });
  });

  const getLinkTypeBadge = (type: LinkType) => {
    switch (type) {
      case 'supports':
        return <span className="bg-emerald-950/70 text-emerald-300 border border-emerald-800/80 px-1 py-0.5 rounded fs-9.5">يدعم</span>;
      case 'contradicts':
        return <span className="bg-rose-950/70 text-rose-300 border border-rose-800/80 px-1 py-0.5 rounded fs-9.5">يناقش</span>;
      case 'extends':
        return <span className="bg-indigo-950/70 text-indigo-300 border border-indigo-800/80 px-1 py-0.5 rounded fs-9.5">يوسع</span>;
      case 'prerequisite':
        return <span className="bg-amber-950/70 text-amber-300 border border-amber-800/80 px-1 py-0.5 rounded fs-9.5">مقدمة</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0b0b] text-[#efe6cf] border-x border-[#2e2817] select-none text-right">
      {/* Middle Column Top Navigation Tabs */}
      <div className="h-10 bg-[#050505] border-b border-[#2e2817] px-1 flex items-center justify-around text-xs">
        <button
          onClick={() => setActiveTab('links')}
          title="شجرة الروابط والتشابكات"
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1 transition fs-11 ${
            activeTab === 'links'
              ? 'bg-[#2e2817] text-[#d4af37] font-bold shadow-xs'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="truncate">الروابط</span>
          {allLinks.length > 0 && (
            <span className="fs-9 bg-blue-950 text-blue-300 px-1 rounded-full font-mono">
              {allLinks.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('verses')}
          title="فهرس الشواهد والآيات"
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1 transition fs-11 ${
            activeTab === 'verses'
              ? 'bg-[#2e2817] text-amber-300 font-bold shadow-xs'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span className="truncate">الآيات</span>
          <span className="fs-9 bg-amber-950 text-amber-300 px-1 rounded-full font-mono">
            {allVerses.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('speakers')}
          title="المتحدثون ومشاركاتهم"
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1 transition fs-11 ${
            activeTab === 'speakers'
              ? 'bg-[#2e2817] text-indigo-300 font-bold shadow-xs'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span className="truncate">المتحدثون</span>
        </button>

        <button
          onClick={() => setActiveTab('outline')}
          title="المخطط الهيكلي والمحاور"
          className={`flex-1 py-1.5 px-1 rounded flex items-center justify-center gap-1 transition fs-11 ${
            activeTab === 'outline'
              ? 'bg-[#2e2817] text-emerald-300 font-bold shadow-xs'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span className="truncate">الهيكل</span>
        </button>
      </div>

      {/* Tab Content Body */}
      <div className="flex-1 overflow-auto custom-scrollbar p-2.5 space-y-2 text-xs font-sans">
        
        {/* TAB 1: LINKS & CROSS-REFERENCES */}
        {activeTab === 'links' && (
          <div className="space-y-2.5">
            {/* Selected Node Connections */}
            {selectedNode.type !== 'project' && (
              <div className="p-2 bg-[#121212] border border-blue-900/50 rounded-md">
                <div className="fs-10.5 font-bold text-[#d4af37] mb-1.5 flex items-center justify-between">
                  <span>روابط العنصر المحدد حالياً:</span>
                  <span className="fs-9 font-mono text-gray-400">
                    {selectedNode.linkedIdeas.length} رابط
                  </span>
                </div>
                {selectedNode.linkedIdeas.length === 0 ? (
                  <p className="fs-10 text-gray-500 font-quran">
                    لا توجد تشابكات مسجلة لهذا العنصر بعد. يمكنك ربطه من لوحة الخصائص بالأسفل.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedNode.linkedIdeas.map(link => {
                      const target = findNodeById(treeData, link.targetId);
                      return (
                        <div
                          key={link.targetId}
                          onClick={() => onSelectNode(link.targetId)}
                          onMouseEnter={() => setHighlightedLinks([link.targetId])}
                          onMouseLeave={() => setHighlightedLinks([])}
                          className="p-1.5 bg-[#0a0a0a] hover:bg-[#2e2817] border border-[#2e2817] rounded cursor-pointer transition fs-11 flex items-center justify-between gap-1 group"
                        >
                          <div className="flex items-center gap-1 truncate">
                            {getLinkTypeBadge(link.type)}
                            <span className="font-quran text-gray-200 truncate group-hover:text-blue-300">
                              {target ? target.arabicLabel : link.targetId}
                            </span>
                          </div>
                          <ExternalLink className="w-3 h-3 text-gray-500 group-hover:text-white flex-shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* All Links Across Entire Project */}
            <div>
              <div className="fs-11 font-bold text-gray-300 mb-1.5 px-1 flex items-center justify-between">
                <span>شبكة التشابكات العامة ({allLinks.length}):</span>
              </div>
              {allLinks.length === 0 ? (
                <div className="p-3 text-center text-gray-500 fs-11">
                  لم يتم إنشاء روابط بين الأفكار بعد.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {allLinks.map((link, idx) => {
                    const target = findNodeById(treeData, link.targetId);
                    return (
                      <div
                        key={idx}
                        onClick={() => onSelectNode(link.source.id)}
                        onMouseEnter={() => setHighlightedLinks([link.source.id, link.targetId])}
                        onMouseLeave={() => setHighlightedLinks([])}
                        className="p-2 bg-[#121212] hover:bg-[#171717] border border-[#2e2817] rounded fs-11 cursor-pointer transition space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-quran font-bold text-gray-300 truncate">
                            {link.source.arabicLabel}
                          </span>
                          {getLinkTypeBadge(link.type)}
                        </div>
                        <div className="flex items-center gap-1 fs-10 text-gray-400 font-quran">
                          <span className="text-gray-500">← متصل بـ:</span>
                          <span className="text-blue-300 truncate font-semibold">
                            {target ? target.arabicLabel : link.targetId}
                          </span>
                        </div>
                        {link.notes && (
                          <p className="fs-9.5 text-gray-400 italic font-quran line-clamp-1 border-r border-blue-500/40 pr-1">
                            {link.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: QURANIC VERSES INDEX */}
        {activeTab === 'verses' && (
          <div className="space-y-2">
            <div className="fs-11 font-bold text-amber-300 px-1 flex items-center justify-between">
              <span>فهرس الشواهد القرآنية ({allVerses.length}):</span>
            </div>
            {allVerses.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onSelectNode(item.node.id)}
                className="p-2.5 bg-[#121212] hover:bg-[#1f1d18] border-r-3 border-r-amber-500 border border-[#2e2817] rounded cursor-pointer transition group"
              >
                <p className="font-quran fs-12.5 text-amber-200/95 leading-relaxed mb-1 line-clamp-3 group-hover:text-amber-100">
                  {item.verse}
                </p>
                <div className="flex items-center justify-between fs-10 text-gray-400 pt-1 border-t border-[#2e2817]/50">
                  <span className="truncate text-gray-300 font-quran">
                    {item.node.arabicLabel}
                  </span>
                  <span className="text-blue-400 flex items-center gap-0.5 flex-shrink-0">
                    <span>انتقال</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: SPEAKERS & CONTRIBUTIONS */}
        {activeTab === 'speakers' && (
          <div className="space-y-2">
            <div className="fs-11 font-bold text-indigo-300 px-1">
              أفكار منسوبة للمتحدثين:
            </div>
            {Array.from(speakerMap.entries()).map(([speaker, nodes]) => (
              <div key={speaker} className="p-2 bg-[#121212] border border-[#2e2817] rounded">
                <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-[#2e2817]">
                  <span className="font-bold text-indigo-200 fs-11.5">{speaker}</span>
                  <span className="fs-9.5 bg-[#2e2817] text-gray-300 px-1.5 py-0.2 rounded font-mono">
                    {nodes.length} فكرة
                  </span>
                </div>
                <div className="space-y-1">
                  {nodes.map(node => (
                    <div
                      key={node.id}
                      onClick={() => onSelectNode(node.id)}
                      className="fs-10.5 font-quran text-gray-300 hover:text-blue-300 hover:bg-[#2e2817]/40 p-1 rounded cursor-pointer truncate flex items-center gap-1"
                    >
                      <span>•</span>
                      <span className="truncate">{node.arabicLabel}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: RESEARCH OUTLINE */}
        {activeTab === 'outline' && (
          <div className="space-y-2">
            <div className="fs-11 font-bold text-emerald-300 px-1">
              المحاور الرئيسية وسير التحرير:
            </div>
            {allNodes.filter(n => n.type === 'axis').map(axis => {
              const childrenCount = axis.children ? axis.children.length : 0;
              return (
                <div
                  key={axis.id}
                  onClick={() => onSelectNode(axis.id)}
                  className="p-2 bg-[#121212] hover:bg-[#1f1d18] border-r-3 border-r-blue-500 border border-[#2e2817] rounded cursor-pointer transition"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-quran font-bold text-gray-200 text-xs">
                      {axis.arabicLabel}
                    </span>
                    <span className={`fs-9.5 px-1.5 py-0.2 rounded font-mono ${
                      axis.status === 'published' ? 'bg-emerald-950 text-emerald-300' :
                      axis.status === 'deferred' ? 'bg-rose-950 text-rose-300' :
                      'bg-amber-950 text-amber-300'
                    }`}>
                      {axis.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between fs-10 text-gray-400">
                    <span>{childrenCount} عناصر متفرعة</span>
                    {axis.targetArticle && <span>{axis.targetArticle}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
};
