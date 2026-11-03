import React, { useState, useEffect } from 'react';
import { useIdeaStore, findNodeById } from '../../store/useIdeaStore';
import { LinkType } from '../../types';
import { 
  Link2, 
  X, 
  Check, 
  ArrowLeft, 
  ArrowDown, 
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  GitBranch,
  Layers
} from 'lucide-react';

export const LinkModal: React.FC = () => {
  const { 
    treeData, 
    linkModalState, 
    closeLinkModal, 
    addIdeaLink, 
    updateIdeaLink 
  } = useIdeaStore();

  const [selectedType, setSelectedType] = useState<LinkType>('supports');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (linkModalState) {
      setSelectedType(linkModalState.initialType || 'supports');
      setNotes(linkModalState.initialNotes || '');
    }
  }, [linkModalState]);

  if (!linkModalState || !linkModalState.isOpen) return null;

  const sourceNode = findNodeById(treeData, linkModalState.sourceId);
  const targetNode = findNodeById(treeData, linkModalState.targetId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (linkModalState.isEdit) {
      updateIdeaLink(linkModalState.sourceId, linkModalState.targetId, {
        type: selectedType,
        notes: notes.trim() || undefined,
      });
    } else {
      addIdeaLink(linkModalState.sourceId, {
        targetId: linkModalState.targetId,
        type: selectedType,
        notes: notes.trim() || undefined,
      });
    }
    closeLinkModal();
  };

  const relationshipOptions: {
    type: LinkType;
    label: string;
    enLabel: string;
    desc: string;
    color: string;
    border: string;
    bg: string;
    icon: string;
  }[] = [
    {
      type: 'supports',
      label: 'يدعم ويثبت',
      enLabel: 'supports',
      desc: 'الفكرة الأولى تقدم شواهد أو أصولاً تؤيد وتدعم الفكرة الثانية.',
      color: 'text-emerald-400',
      border: 'border-emerald-500/50',
      bg: 'bg-emerald-950/30',
      icon: '🟢',
    },
    {
      type: 'contradicts',
      label: 'يناقض / يعارض',
      enLabel: 'contradicts',
      desc: 'الفكرة الأولى تشكل إشكالاً أو مفارقة أو تناقضاً يستوجب الترجيح أو الجمع.',
      color: 'text-rose-400',
      border: 'border-rose-500/50',
      bg: 'bg-rose-950/30',
      icon: '🔴',
    },
    {
      type: 'extends',
      label: 'يبني على / يوسع',
      enLabel: 'extends',
      desc: 'الفكرة الأولى تتفرع معرفياً أو تحليلياً وتوسع أفق الفكرة الثانية.',
      color: 'text-blue-400',
      border: 'border-blue-500/50',
      bg: 'bg-blue-950/30',
      icon: '🔵',
    },
    {
      type: 'prerequisite',
      label: 'مقدمة لازمة',
      enLabel: 'prerequisite',
      desc: 'الفكرة الأولى تأسيس منهجي أو لغوي لا يصح فهم الفكرة الثانية بدونه.',
      color: 'text-amber-400',
      border: 'border-amber-500/50',
      bg: 'bg-amber-950/30',
      icon: '🟠',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none text-right">
      <div className="bg-[#121212] border border-[#4a4027] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden text-[#efe6cf] animate-in fade-in-50 zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="h-12 px-4 bg-[#0a0a0a] border-b border-[#2e2817] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold text-white">
              {linkModalState.isEdit ? 'تعديل علاقة التشابك' : 'إنشاء علاقة تشابك جديدة (New Idea Link)'}
            </h2>
          </div>
          <button
            onClick={closeLinkModal}
            className="p-1 hover:bg-[#2e2817] text-gray-400 hover:text-white rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs font-sans">
          
          {/* Nodes Preview Banner */}
          <div className="p-3 bg-[#0a0a0a] border border-[#2e2817] rounded-lg space-y-2">
            {/* Source Node */}
            <div className="flex items-center gap-2">
              <span className="fs-10 text-gray-400 font-mono w-16 text-left">الأصل (Source):</span>
              <span className="text-white font-quran font-bold text-xs truncate flex-1">
                {sourceNode ? sourceNode.arabicLabel : linkModalState.sourceId}
              </span>
            </div>

            {/* Connecting Direction Indicator */}
            <div className="flex items-center justify-center gap-2 text-indigo-400 fs-11 font-mono py-0.5">
              <span>───▶</span>
              <span className="font-bold">{relationshipOptions.find(o => o.type === selectedType)?.label}</span>
              <span>───▶</span>
            </div>

            {/* Target Node */}
            <div className="flex items-center gap-2">
              <span className="fs-10 text-gray-400 font-mono w-16 text-left">الهدف (Target):</span>
              <span className="text-white font-quran font-bold text-xs truncate flex-1">
                {targetNode ? targetNode.arabicLabel : linkModalState.targetId}
              </span>
            </div>
          </div>

          {/* Relationship Type Selection Cards */}
          <div className="space-y-1.5">
            <label className="fs-11 font-medium text-gray-300 block">
              طبيعة العلاقة الدلالية (Relationship Type):
            </label>
            <div className="grid grid-cols-2 gap-2">
              {relationshipOptions.map(option => {
                const isSelected = selectedType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => setSelectedType(option.type)}
                    className={`p-2.5 rounded-lg border text-right transition-all flex flex-col gap-1 ${
                      isSelected
                        ? `${option.bg} ${option.border} ring-2 ring-indigo-500/60 shadow-xs`
                        : 'bg-[#0a0a0a] border-[#2e2817] hover:bg-[#171717] text-gray-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-bold text-xs ${isSelected ? option.color : 'text-gray-300'}`}>
                        {option.label}
                      </span>
                      <span className="text-xs">{option.icon}</span>
                    </div>
                    <span className="fs-9.5 font-mono text-gray-500 uppercase">
                      {option.enLabel}
                    </span>
                    <p className="fs-10 text-gray-400 leading-snug line-clamp-2 mt-0.5">
                      {option.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Relationship Note */}
          <div className="space-y-1">
            <label className="fs-11 font-medium text-gray-300 block">
              ملاحظة حول أثر الارتباط وتوجيهه (Notes - اختياري):
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="اكتب تعليقاً منهجياً يوضح وجه الارتباط..."
              className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded p-2 text-white font-quran text-xs leading-relaxed focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#2e2817]">
            <button
              type="button"
              onClick={closeLinkModal}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold shadow-md transition flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{linkModalState.isEdit ? 'حفظ التعديلات' : 'تأكيد إنشاء الرابط'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
