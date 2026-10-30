import React, { useState } from 'react';
import { useIdeaStore, findNodeById, getAllNodeList } from '../../store/useIdeaStore';
import { 
  IdeaSource, 
  NodeStatus, 
  NodePriority, 
  LinkType, 
  IdeaLink 
} from '../../types';
import { 
  Settings, 
  Sliders, 
  User, 
  BookOpen, 
  Link2, 
  Plus, 
  X, 
  Quote, 
  Sparkles, 
  HelpCircle, 
  Check, 
  Bookmark,
  FileText
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

export const ParametersPanel: React.FC = () => {
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
  const isProjectRoot = selectedNode.id === treeData.id;

  // Local state for adding tag / cross reference
  const [newCrossRef, setNewCrossRef] = useState('');
  const [newSpeaker, setNewSpeaker] = useState('');

  // Local state for adding linked idea
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkType, setLinkType] = useState<LinkType>('supports');
  const [linkNotes, setLinkNotes] = useState('');

  // All eligible target nodes for linking (excluding self)
  const allNodes = getAllNodeList(treeData, selectedNode.id);

  const handleAddCrossRef = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!newCrossRef.trim()) return;
    const current = selectedNode.crossReferences || [];
    if (!current.includes(newCrossRef.trim())) {
      updateNode(selectedNode.id, {
        crossReferences: [...current, newCrossRef.trim()]
      });
    }
    setNewCrossRef('');
  };

  const handleRemoveCrossRef = (refToRemove: string) => {
    updateNode(selectedNode.id, {
      crossReferences: selectedNode.crossReferences.filter(r => r !== refToRemove)
    });
  };

  const handleToggleSpeaker = (speaker: string) => {
    const current = selectedNode.speakers || [];
    const updated = current.includes(speaker)
      ? current.filter(s => s !== speaker)
      : [...current, speaker];
    updateNode(selectedNode.id, { speakers: updated });
  };

  const handleAddCustomSpeaker = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    if (!newSpeaker.trim()) return;
    const current = selectedNode.speakers || [];
    if (!current.includes(newSpeaker.trim())) {
      updateNode(selectedNode.id, {
        speakers: [...current, newSpeaker.trim()]
      });
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
  };

  const insertQuranicBrackets = () => {
    const current = selectedNode.quranicVerses || '';
    updateNode(selectedNode.id, {
      quranicVerses: current ? `${current} ﴿ ﴾` : '﴿ ﴾'
    });
  };

  const getLinkTypeBadge = (type: LinkType) => {
    switch (type) {
      case 'supports':
        return <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-800 px-1.5 py-0.5 rounded text-[10px]">يدعم (Supports)</span>;
      case 'contradicts':
        return <span className="bg-rose-950/60 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded text-[10px]">يناقش/يعارض (Contradicts)</span>;
      case 'extends':
        return <span className="bg-indigo-950/60 text-indigo-300 border border-indigo-800 px-1.5 py-0.5 rounded text-[10px]">يبني على/يوسع (Extends)</span>;
      case 'prerequisite':
        return <span className="bg-amber-950/60 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded text-[10px]">مقدمة لازمة (Prerequisite)</span>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e] text-[#cdd6f4] border-l border-[#313244] select-none text-right">
      {/* Panel Header */}
      <div className="h-10 px-3 border-b border-[#313244] bg-[#181825] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#89b4fa]" />
          <span className="font-semibold text-xs text-[#cdd6f4]">
            {isProjectRoot ? 'خصائص المشروع والبحث العام' : 'لوحة الخصائص (PARAMETERS PANEL)'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-[#a6adc8] bg-[#313244] px-2 py-0.5 rounded">
          {selectedNode.type.toUpperCase()}
        </span>
      </div>

      {/* Form Content Area */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-4 text-xs font-sans">
        
        {/* If Root Project is Selected */}
        {isProjectRoot ? (
          <div className="space-y-4">
            <div className="p-2.5 bg-blue-950/20 border border-blue-900/40 rounded text-blue-300 text-[11.5px] leading-relaxed">
              هذه لوحة إعدادات البحث الشامل. التغييرات هنا تنعكس تلقائياً على ترويسة ومقدمة وثيقة Word.
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#a6adc8] block">عنوان المشروع (Title):</label>
              <input
                type="text"
                value={projectSettings.title}
                onChange={(e) => updateProjectSettings({ title: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-white font-quran text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#a6adc8] block">العنوان الفرعي (Subtitle):</label>
              <input
                type="text"
                value={projectSettings.subtitle || ''}
                onChange={(e) => updateProjectSettings({ subtitle: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-[#cdd6f4] font-quran text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#a6adc8] block">الباحث / الفريق:</label>
                <input
                  type="text"
                  value={projectSettings.author}
                  onChange={(e) => updateProjectSettings({ author: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#a6adc8] block">التاريخ / العام:</label>
                <input
                  type="text"
                  value={projectSettings.date}
                  onChange={(e) => updateProjectSettings({ date: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#a6adc8] block">توطئة ومنهجية البحث (Description):</label>
              <textarea
                rows={4}
                value={projectSettings.description}
                onChange={(e) => updateProjectSettings({ description: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-white font-quran text-xs leading-relaxed focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          /* Normal Node Parameters Form */
          <>
            {/* 1. Identity & Label */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#a6adc8]">التسمية العربية (Arabic Label):</label>
                <input
                  type="text"
                  value={selectedNode.arabicLabel}
                  onChange={(e) => updateNode(selectedNode.id, { arabicLabel: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-white font-quran text-[13.5px] font-bold focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[#a6adc8]">الاسم المعرف (Idea Name EN):</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1.5 text-[#cdd6f4] font-mono text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* 2. Source, Ref, Status & Priority */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="space-y-1">
                <label className="text-[10.5px] text-[#a6adc8]">المصدر (Source):</label>
                <select
                  value={selectedNode.source}
                  onChange={(e) => updateNode(selectedNode.id, { source: e.target.value as IdeaSource })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                >
                  <option value="rasheed_article">مقال د. رشيد</option>
                  <option value="brainstorm_session">جلسة عصف ذهني</option>
                  <option value="mostafa_outline">محاور مصطفى</option>
                  <option value="external_reference">مرجع خارجي</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] text-[#a6adc8]">الحالة (Status):</label>
                <select
                  value={selectedNode.status}
                  onChange={(e) => updateNode(selectedNode.id, { status: e.target.value as NodeStatus })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                >
                  <option value="published">🟢 منشور (Published)</option>
                  <option value="draft">🟡 مسودة (Draft)</option>
                  <option value="deferred">🔴 مؤجل (Deferred)</option>
                  <option value="brainstorm">🔵 جديد من العصف (Brainstorm)</option>
                  <option value="rejected">⚫ مرفوض (Rejected)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] text-[#a6adc8]">الأولوية (Priority):</label>
                <select
                  value={selectedNode.priority}
                  onChange={(e) => updateNode(selectedNode.id, { priority: e.target.value as NodePriority })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                >
                  <option value="high">عالية (High)</option>
                  <option value="medium">متوسطة (Medium)</option>
                  <option value="low">منخفضة (Low)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10.5px] text-[#a6adc8]">المقال / الجزء المستهدف:</label>
                <input
                  type="text"
                  value={selectedNode.targetArticle || ''}
                  placeholder="Part 17"
                  onChange={(e) => updateNode(selectedNode.id, { targetArticle: e.target.value })}
                  className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Session Reference */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#a6adc8]">مرجع الجلسة (Session Ref):</label>
              <input
                type="text"
                value={selectedNode.sessionRef || ''}
                placeholder="e.g. EP187 Oct 25"
                onChange={(e) => updateNode(selectedNode.id, { sessionRef: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
              />
            </div>

            {/* 3. Speakers Selection */}
            <div className="space-y-1.5 border-t border-[#313244] pt-2">
              <label className="text-[11px] font-medium text-[#a6adc8] flex items-center justify-between">
                <span>المتحدثون (Speakers):</span>
                <span className="text-[10px] text-gray-500 font-sans">انقر للاختيار</span>
              </label>

              {/* Predefined speakers chip list */}
              <div className="flex flex-wrap gap-1.5">
                {ALL_SPEAKERS.map(speaker => {
                  const isChecked = selectedNode.speakers.includes(speaker);
                  return (
                    <button
                      key={speaker}
                      type="button"
                      onClick={() => handleToggleSpeaker(speaker)}
                      className={`px-2 py-0.5 rounded text-[11px] transition-colors border ${
                        isChecked
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                          : 'bg-[#181825] border-[#313244] text-gray-400 hover:text-white'
                      }`}
                    >
                      {isChecked ? '✓ ' : ''}{speaker}
                    </button>
                  );
                })}
              </div>

              {/* Custom speaker input */}
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  type="text"
                  value={newSpeaker}
                  placeholder="إضافة متحدث آخر..."
                  onChange={(e) => setNewSpeaker(e.target.value)}
                  onKeyDown={handleAddCustomSpeaker}
                  className="bg-[#181825] border border-[#313244] rounded px-2 py-0.5 text-xs text-white focus:outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddCustomSpeaker}
                  className="px-2 py-0.5 bg-[#313244] hover:bg-[#45475a] text-xs text-white rounded"
                >
                  إضافة
                </button>
              </div>
            </div>

            {/* 4. Quranic Verses */}
            <div className="space-y-1 border-t border-[#313244] pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[#a6adc8] flex items-center gap-1">
                  <span>الآيات القرآنية والشواهد (Quranic Verses):</span>
                </label>
                <button
                  type="button"
                  onClick={insertQuranicBrackets}
                  title="إدراج قوسين مزخرفين ﴿ ﴾"
                  className="text-[11px] text-amber-300 hover:text-amber-200 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded flex items-center gap-1"
                >
                  <Quote className="w-3 h-3" />
                  <span>إدراج ﴿ ﴾</span>
                </button>
              </div>

              <textarea
                rows={3}
                value={selectedNode.quranicVerses || ''}
                placeholder="﴿وَإِنَّكُمْ لَتَمُرُّونَ عَلَيْهِم مُّصْبِحِينَ * وَبِاللَّيْلِ أَفَلَا تَعْقِلُونَ﴾ [الصافات: 137-138]"
                onChange={(e) => updateNode(selectedNode.id, { quranicVerses: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-amber-200 font-quran text-sm leading-relaxed focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* 5. Cross References (التقاطعات) */}
            <div className="space-y-1.5 border-t border-[#313244] pt-2">
              <label className="text-[11px] font-medium text-[#a6adc8]">التقاطعات والشواهد المقارنة (Cross-References):</label>
              
              <div className="flex flex-wrap gap-1.5 mb-1.5 min-h-[24px]">
                {selectedNode.crossReferences.map((ref) => (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#313244] text-amber-300 text-[11px] border border-amber-900/40 font-mono"
                  >
                    <span>{ref}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCrossRef(ref)}
                      className="text-gray-400 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCrossRef}
                  placeholder="مثل: آل عمران:42 أو التحريم:10"
                  onChange={(e) => setNewCrossRef(e.target.value)}
                  onKeyDown={handleAddCrossRef}
                  className="bg-[#181825] border border-[#313244] rounded px-2 py-1 text-xs text-white focus:outline-none flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={handleAddCrossRef}
                  className="px-2.5 py-1 bg-[#313244] hover:bg-[#45475a] text-xs text-white rounded"
                >
                  + إضافة تقاطع
                </button>
              </div>
            </div>

            {/* 6. Linked Ideas (التشابكات عبر الفروع) */}
            <div className="space-y-2 border-t border-[#313244] pt-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-[#89b4fa] flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5" />
                  <span>الأفكار المرتبطة والتشابكات (Linked Ideas):</span>
                </label>
                <span className="text-[10px] text-gray-500">
                  {selectedNode.linkedIdeas.length} رابط
                </span>
              </div>

              {/* Active links list */}
              {selectedNode.linkedIdeas.length > 0 && (
                <div className="space-y-1.5 bg-[#181825] p-2 rounded border border-[#313244]">
                  {selectedNode.linkedIdeas.map((link) => {
                    const targetNode = findNodeById(treeData, link.targetId);
                    return (
                      <div
                        key={link.targetId}
                        className="flex items-center justify-between gap-2 p-1.5 bg-[#1e1e2e] rounded border border-[#313244]/80 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {getLinkTypeBadge(link.type)}
                          <span className="text-white font-quran truncate">
                            {targetNode ? targetNode.arabicLabel : link.targetId}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeIdeaLink(selectedNode.id, link.targetId)}
                          className="text-gray-400 hover:text-rose-400 p-0.5"
                          title="حذف الرابط"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Link Widget */}
              <div className="p-2 bg-[#181825]/60 border border-[#313244] rounded space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">اختر الفكرة المستهدفة:</label>
                    <select
                      value={linkTargetId}
                      onChange={(e) => setLinkTargetId(e.target.value)}
                      className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                    >
                      <option value="">-- اختر من الشجرة --</option>
                      {allNodes.map(node => (
                        <option key={node.id} value={node.id}>
                          {node.type === 'axis' ? '📐 ' : '💡 '} {node.arabicLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">طبيعة العلاقة (Link Type):</label>
                    <select
                      value={linkType}
                      onChange={(e) => setLinkType(e.target.value as LinkType)}
                      className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-white text-xs focus:outline-none"
                    >
                      <option value="supports">يدعم (supports)</option>
                      <option value="contradicts">يعارض / يناقش (contradicts)</option>
                      <option value="extends">يبني على / يوسع (extends)</option>
                      <option value="prerequisite">مقدمة لازمة (prerequisite)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linkNotes}
                    placeholder="ملاحظة حول العلاقة والربط (اختياري)..."
                    onChange={(e) => setLinkNotes(e.target.value)}
                    className="bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] flex-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    disabled={!linkTargetId}
                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-medium transition"
                  >
                    + ربط الفكرة
                  </button>
                </div>
              </div>
            </div>

            {/* 7. Notes & Detailed Text */}
            <div className="space-y-1 border-t border-[#313244] pt-2">
              <label className="text-[11px] font-medium text-[#a6adc8] block">الملاحظات والشرح التحريري (Notes):</label>
              <textarea
                rows={4}
                value={selectedNode.notes || ''}
                placeholder="اكتب التحليل التفصيلي، المفارقات، وتوجيه المعاني للبحث..."
                onChange={(e) => updateNode(selectedNode.id, { notes: e.target.value })}
                className="w-full bg-[#181825] border border-[#313244] rounded p-2 text-white font-quran text-[13px] leading-relaxed focus:border-blue-500 focus:outline-none"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
