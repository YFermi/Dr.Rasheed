import React, { useState, useEffect, useRef } from 'react';
import { useIdeaStore, findNodeById, getAllNodeList } from '../../store/useIdeaStore';
import { BlogRefsSection } from './BlogRefsSection';
import { useReferenceStore, referenceArticleTitle } from '../../store/useReferenceStore';
import { 
  IdeaSource, 
  NodeStatus, 
  NodePriority, 
  LinkType, 
  IdeaLink,
  IdeaRole,
  ideaRole
} from '../../types';
import { 
  Sliders, 
  Check, 
  Quote, 
  X, 
  Link2, 
  BookOpen, 
  Sparkles,
  CheckCircle2,
  Bookmark
} from 'lucide-react';

const ALL_SPEAKERS = [
  'د. رشيد',
  'مصطفى',
  'يوسف',
  'زكريا',
  'AboHaron',
  'علي نور',
  'أبو معتز'
];

export const ParametersTab: React.FC = () => {
  const {
    treeData,
    selectedNodeId,
    projectSettings,
    updateNode,
    updateProjectSettings,
    addIdeaLink,
    removeIdeaLink,
  } = useIdeaStore();

  const selectedNode = findNodeById(treeData, selectedNodeId) || treeData;
  const referenceArticles = useReferenceStore(state => state.referenceArticles);
  const isProjectRoot = selectedNode.id === treeData.id;

  // Auto-save visual feedback indicator (debounced 500ms)
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSaveFeedback = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setShowSavedIndicator(true);
      setTimeout(() => setShowSavedIndicator(false), 1500);
    }, 400);
  };

  // Local state for tags
  const [newCrossRef, setNewCrossRef] = useState('');
  const [newSpeaker, setNewSpeaker] = useState('');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('supports');
  const [linkNotes, setLinkNotes] = useState('');

  const allNodes = getAllNodeList(treeData, selectedNode.id);

  const handleFieldChange = (updates: any) => {
    updateNode(selectedNode.id, updates);
    triggerSaveFeedback();
  };

  const handleAddCrossRef = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!newCrossRef.trim()) return;
    const current = selectedNode.crossReferences || [];
    if (!current.includes(newCrossRef.trim())) {
      handleFieldChange({ crossReferences: [...current, newCrossRef.trim()] });
    }
    setNewCrossRef('');
  };

  const handleRemoveCrossRef = (refToRemove: string) => {
    handleFieldChange({
      crossReferences: selectedNode.crossReferences.filter(r => r !== refToRemove)
    });
  };

  const handleToggleSpeaker = (speaker: string) => {
    const current = selectedNode.speakers || [];
    const updated = current.includes(speaker)
      ? current.filter(s => s !== speaker)
      : [...current, speaker];
    handleFieldChange({ speakers: updated });
  };

  const handleAddCustomSpeaker = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!newSpeaker.trim()) return;
    const current = selectedNode.speakers || [];
    if (!current.includes(newSpeaker.trim())) {
      handleFieldChange({ speakers: [...current, newSpeaker.trim()] });
    }
    setNewSpeaker('');
  };

  const handleAddLink = () => {
    if (!linkTargetId) return;
    addIdeaLink(selectedNode.id, {
      targetId: linkTargetId,
      type: linkType,
      notes: linkNotes.trim() || undefined,
    });
    setLinkTargetId('');
    setLinkNotes('');
    triggerSaveFeedback();
  };

  const insertQuranicBrackets = () => {
    const current = selectedNode.quranicVerses || '';
    handleFieldChange({
      quranicVerses: current ? `${current} ﴿ ﴾` : '﴿ ﴾'
    });
  };

  const getStatusColorDot = (status: NodeStatus) => {
    switch (status) {
      case 'published': return 'bg-emerald-500';
      case 'draft': return 'bg-amber-400';
      case 'deferred': return 'bg-rose-500';
      case 'brainstorm': return 'bg-blue-400';
      case 'rejected': return 'bg-gray-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#252536] text-[#cdd6f4] select-none text-right font-sans">
      
      {/* Parameters Header with Auto-Save Badge */}
      <div className="h-9 px-3 bg-[#1e1e2d] border-b border-[#313244] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-white">
            {isProjectRoot ? 'خصائص البحث العام' : `خصائص: ${selectedNode.arabicLabel}`}
          </span>
          <span className="text-[10px] font-mono bg-[#313244] text-[#89b4fa] px-1.5 py-0.2 rounded uppercase">
            {selectedNode.type}
          </span>
        </div>

        {/* Auto-Save Visual Indicator */}
        <div className="flex items-center gap-1 text-[11px]">
          {showSavedIndicator ? (
            <span className="text-emerald-400 flex items-center gap-1 font-medium animate-in fade-in duration-100">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تم الحفظ تلقائياً</span>
            </span>
          ) : (
            <span className="text-gray-500 text-[10px]">حفظ تلقائي</span>
          )}
        </div>
      </div>

      {/* Parameters Scroll Body */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-3.5 text-xs">
        {isProjectRoot ? (
          /* Root Project Settings */
          <div className="space-y-3">
            <div className="p-2.5 bg-blue-950/30 border border-blue-800/40 rounded text-blue-200 text-[11px] leading-relaxed">
              هذه لوحة الخصائص للمشروع العام. التعديلات هنا تنعكس فورياً على غلاف ووثيقة Word.
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300 block">عنوان المشروع (Title):</label>
              <input
                type="text"
                value={projectSettings.title}
                onChange={(e) => {
                  updateProjectSettings({ title: e.target.value });
                  triggerSaveFeedback();
                }}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-white font-quran text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300 block">العنوان الفرعي (Subtitle):</label>
              <input
                type="text"
                value={projectSettings.subtitle || ''}
                onChange={(e) => {
                  updateProjectSettings({ subtitle: e.target.value });
                  triggerSaveFeedback();
                }}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-[#cdd6f4] font-quran text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10.5px] text-gray-400 block">الباحث / الفريق:</label>
                <input
                  type="text"
                  value={projectSettings.author}
                  onChange={(e) => {
                    updateProjectSettings({ author: e.target.value });
                    triggerSaveFeedback();
                  }}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10.5px] text-gray-400 block">التاريخ / العام:</label>
                <input
                  type="text"
                  value={projectSettings.date}
                  onChange={(e) => {
                    updateProjectSettings({ date: e.target.value });
                    triggerSaveFeedback();
                  }}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-300 block">توطئة ومنهجية البحث (Description):</label>
              <textarea
                rows={4}
                value={projectSettings.description}
                onChange={(e) => {
                  updateProjectSettings({ description: e.target.value });
                  triggerSaveFeedback();
                }}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-white font-quran text-xs leading-relaxed focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          /* Selected Node Parameters Form */
          <>
            {/* 1. Name & Arabic Label */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10.5px] font-medium text-gray-300 block">التسمية العربية (Arabic Label):</label>
                <input
                  type="text"
                  value={selectedNode.arabicLabel}
                  onChange={(e) => handleFieldChange({ arabicLabel: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white font-quran text-sm font-bold focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] text-gray-400 block">الاسم المعرف (Idea Name EN):</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => handleFieldChange({ name: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-gray-300 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* 2. Source & Session Reference */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#313244]">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">المصدر (Source):</label>
                <select
                  value={selectedNode.source}
                  onChange={(e) => handleFieldChange({ source: e.target.value as IdeaSource })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                >
                  <option value="rasheed_article">مقال د. رشيد</option>
                  <option value="brainstorm_session">جلسة عصف</option>
                  <option value="mostafa_outline">محاور مصطفى</option>
                  <option value="external_reference">مرجع خارجي</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">مرجع الجلسة (Session Ref):</label>
                <input
                  type="text"
                  value={selectedNode.sessionRef || ''}
                  placeholder="EP187 Oct 25"
                  onChange={(e) => handleFieldChange({ sessionRef: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                />
              </div>
            </div>

            {/* Role: reference (from a finished article, for linking only) or draft (to write) */}
            {selectedNode.type !== 'project' && (
              <div className={`space-y-1 p-2 rounded border ${ideaRole(selectedNode) === 'reference' ? 'bg-[#1e3a5f]/40 border-sky-800/60' : 'border-[#313244]'}`}>
                <label className="text-[10px] text-gray-400 block">دور الفكرة (Role):</label>
                <select
                  value={ideaRole(selectedNode)}
                  onChange={(e) => handleFieldChange({ role: e.target.value as IdeaRole })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                >
                  <option value="draft">✍️ فكرة كتابة (تُكتب في المقال الجديد)</option>
                  <option value="reference">📌 فكرة مرجعية (للربط والاستدلال فقط)</option>
                </select>
                {selectedNode.referenceArticleId && (
                  <p className="text-[10px] text-sky-300/80 leading-relaxed">
                    من المقال المرجعي: «{referenceArticleTitle(selectedNode, referenceArticles) || 'غير معروف'}»
                    <span dir="ltr" className="block font-mono text-gray-500">{selectedNode.referenceArticleId}</span>
                  </p>
                )}
              </div>
            )}

            {/* 3. Status & Priority */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${getStatusColorDot(selectedNode.status)}`} />
                  <span>الحالة (Status):</span>
                </label>
                <select
                  value={selectedNode.status}
                  onChange={(e) => handleFieldChange({ status: e.target.value as NodeStatus })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                >
                  <option value="published">منشور (Published)</option>
                  <option value="draft">مسودة (Draft)</option>
                  <option value="deferred">مؤجل (Deferred)</option>
                  <option value="brainstorm">عصف (Brainstorm)</option>
                  <option value="rejected">مرفوض (Rejected)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 block">الأولوية (Priority):</label>
                <select
                  value={selectedNode.priority}
                  onChange={(e) => handleFieldChange({ priority: e.target.value as NodePriority })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-1.5 py-1 text-white text-[11px] focus:outline-none"
                >
                  <option value="high">عالية (High)</option>
                  <option value="medium">متوسطة (Medium)</option>
                  <option value="low">منخفضة (Low)</option>
                </select>
              </div>
            </div>

            {/* 4. Target Article */}
            <div className="space-y-1">
              <label className="text-[10.5px] text-gray-400 block">المقال / الجزء المستهدف (Target Article):</label>
              <input
                type="text"
                value={selectedNode.targetArticle || ''}
                placeholder="Part 17"
                onChange={(e) => handleFieldChange({ targetArticle: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
              />
            </div>

            {/* 5. Speakers (Multi-select tag chips) */}
            <div className="space-y-1.5 border-t border-[#313244] pt-2">
              <label className="text-[10.5px] font-medium text-gray-300 block">المتحدثون (Speakers):</label>
              <div className="flex flex-wrap gap-1">
                {ALL_SPEAKERS.map(spk => {
                  const isChecked = selectedNode.speakers.includes(spk);
                  return (
                    <button
                      key={spk}
                      type="button"
                      onClick={() => handleToggleSpeaker(spk)}
                      className={`px-2 py-0.5 rounded text-[10.5px] transition border ${
                        isChecked
                          ? 'bg-indigo-600/40 border-indigo-500 text-indigo-200 font-bold'
                          : 'bg-[#181825] border-[#313244] text-gray-400 hover:text-white'
                      }`}
                    >
                      {isChecked ? '✓ ' : ''}{spk}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Speaker */}
              <div className="flex items-center gap-1 mt-1">
                <input
                  type="text"
                  value={newSpeaker}
                  placeholder="إضافة متحدث..."
                  onChange={(e) => setNewSpeaker(e.target.value)}
                  onKeyDown={handleAddCustomSpeaker}
                  className="bg-[#181825] border border-[#313244] rounded px-2 py-0.5 text-xs text-white focus:outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSpeaker}
                  className="px-2 py-0.5 bg-[#313244] text-gray-300 hover:text-white rounded text-xs"
                >
                  إضافة
                </button>
              </div>
            </div>

            {/* 6. Quranic Verses */}
            <div className="space-y-1 border-t border-[#313244] pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[10.5px] font-medium text-amber-300 block">الآيات والشواهد القرآنية:</label>
                <button
                  type="button"
                  onClick={insertQuranicBrackets}
                  className="text-[10px] text-amber-300 hover:text-amber-200 bg-amber-950/40 border border-amber-800/60 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                >
                  <Quote className="w-2.5 h-2.5" />
                  <span>﴿ ﴾</span>
                </button>
              </div>
              <textarea
                rows={2}
                value={selectedNode.quranicVerses || ''}
                placeholder="﴿وَإِنَّهَا لَبِسَبِيلٍ مُّقِيمٍ﴾ [الحجر: 76]"
                onChange={(e) => handleFieldChange({ quranicVerses: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-amber-200 font-quran text-xs leading-relaxed focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* 7. Cross-References */}
            <div className="space-y-1.5 border-t border-[#313244] pt-2">
              <label className="text-[10.5px] text-gray-300 block">التقاطعات (Cross-References):</label>
              <div className="flex flex-wrap gap-1 min-h-[22px]">
                {selectedNode.crossReferences.map(ref => (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#181825] text-amber-300 text-[10.5px] border border-amber-900/40 font-mono"
                  >
                    <span>{ref}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCrossRef(ref)}
                      className="text-gray-400 hover:text-rose-400"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newCrossRef}
                  placeholder="آل عمران:42"
                  onChange={(e) => setNewCrossRef(e.target.value)}
                  onKeyDown={handleAddCrossRef}
                  className="bg-[#181825] border border-[#313244] rounded px-2 py-0.5 text-xs text-white flex-1 font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCrossRef}
                  className="px-2 py-0.5 bg-[#313244] hover:bg-[#45475a] text-xs text-white rounded"
                >
                  + إضافة
                </button>
              </div>
            </div>

            {/* 8. Linked Ideas */}
            <div className="space-y-1.5 border-t border-[#313244] pt-2">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="font-medium text-[#89b4fa] flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  <span>الأفكار المرتبطة ({selectedNode.linkedIdeas.length}):</span>
                </span>
              </div>

              {selectedNode.linkedIdeas.length > 0 && (
                <div className="space-y-1">
                  {selectedNode.linkedIdeas.map(link => {
                    const targetNode = findNodeById(treeData, link.targetId);
                    return (
                      <div
                        key={link.targetId}
                        className="flex items-center justify-between gap-1 p-1.5 bg-[#181825] rounded border border-[#313244] text-[10.5px]"
                      >
                        <span className="text-white font-quran truncate">
                          {targetNode ? targetNode.arabicLabel : link.targetId}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 font-mono">
                            {link.type}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeIdeaLink(selectedNode.id, link.targetId)}
                            className="text-gray-400 hover:text-rose-400"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Link */}
              <div className="p-2 bg-[#181825]/70 border border-[#313244] rounded space-y-1.5 mt-1">
                <div className="grid grid-cols-2 gap-1">
                  <select
                    value={linkTargetId}
                    onChange={(e) => setLinkTargetId(e.target.value)}
                    className="bg-[#252536] border border-[#313244] rounded px-1.5 py-0.5 text-white text-[10.5px] focus:outline-none"
                  >
                    <option value="">-- اختر فكرة للربط --</option>
                    {allNodes.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.arabicLabel}
                      </option>
                    ))}
                  </select>

                  <select
                    value={linkType}
                    onChange={(e) => setLinkType(e.target.value as LinkType)}
                    className="bg-[#252536] border border-[#313244] rounded px-1.5 py-0.5 text-white text-[10.5px] focus:outline-none"
                  >
                    <option value="supports">يدعم (supports)</option>
                    <option value="contradicts">يناقض (contradicts)</option>
                    <option value="extends">يوسع (extends)</option>
                    <option value="prerequisite">مقدمة (prerequisite)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={linkNotes}
                    placeholder="ملاحظة حول الرابط..."
                    onChange={(e) => setLinkNotes(e.target.value)}
                    className="bg-[#252536] border border-[#313244] rounded px-2 py-0.5 text-xs text-[#cdd6f4] flex-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={!linkTargetId}
                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded text-xs"
                  >
                    + ربط
                  </button>
                </div>
              </div>
            </div>

            {/* 9. Notes */}
            <div className="space-y-1 border-t border-[#313244] pt-2">
              <label className="text-[10.5px] font-medium text-gray-300 block">الملاحظات والشرح التحريري (Notes):</label>
              <textarea
                rows={3}
                value={selectedNode.notes || ''}
                placeholder="اكتب التحليل التفصيلي..."
                onChange={(e) => handleFieldChange({ notes: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-white font-quran text-xs leading-relaxed focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {/* 10. Blog References */}
            <BlogRefsSection
              key={selectedNode.id}
              blogRefs={selectedNode.blogRefs ?? []}
              onChange={(blogRefs) => handleFieldChange({ blogRefs })}
            />
          </>
        )}
      </div>
    </div>
  );
};
