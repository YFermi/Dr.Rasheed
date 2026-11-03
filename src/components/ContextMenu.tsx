import React, { useEffect, useRef } from 'react';
import { 
  FolderPlus, 
  PlusCircle, 
  Trash2, 
  Copy, 
  Scissors, 
  Clipboard, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  EyeOff, 
  Layers,
  Pin,
  PenLine
} from 'lucide-react';
import { IdeaNode, ideaRole } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  node: IdeaNode;
  onClose: () => void;
  onAddChild: (type?: any) => void;
  onAddSibling: (type?: any) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onToggleInclude: () => void;
  onToggleRole: () => void;
  hasClipboard: boolean;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  node,
  onClose,
  onAddChild,
  onAddSibling,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onCut,
  onCopy,
  onPaste,
  onToggleInclude,
  onToggleRole,
  hasClipboard,
}) => {
  const isReference = ideaRole(node) === 'reference';
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow screen
  const adjustedX = Math.min(x, window.innerWidth - 230);
  const adjustedY = Math.min(y, window.innerHeight - 370);

  return (
    <div
      ref={menuRef}
      style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
      className="fixed z-50 w-56 bg-[#1e1e2e] border border-[#45475a] rounded-md shadow-2xl py-1 text-xs text-[#cdd6f4] select-none backdrop-blur-md animate-in fade-in-50 duration-100"
    >
      <div className="px-3 py-1.5 border-b border-[#313244] text-[11px] font-semibold text-[#89b4fa] truncate flex items-center justify-between">
        <span className="truncate">{node.arabicLabel}</span>
        <span className="text-[10px] text-[#a6adc8] font-mono uppercase bg-[#313244] px-1 rounded">
          {node.type}
        </span>
      </div>

      <div className="py-1">
        <button
          onClick={() => { onAddChild(); onClose(); }}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <FolderPlus className="w-3.5 h-3.5 text-blue-400" />
            <span>إضافة عنصر فرعي (Child)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Ins</span>
        </button>

        {node.type !== 'project' && (
          <button
            onClick={() => { onAddSibling(); onClose(); }}
            className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>إضافة عنصر موازٍ (Sibling)</span>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">Enter</span>
          </button>
        )}
      </div>

      <div className="h-px bg-[#313244] my-1" />

      <div className="py-1">
        <button
          onClick={() => { onCut(); onClose(); }}
          disabled={node.type === 'project'}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors disabled:opacity-40"
        >
          <div className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>قص (Cut)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Ctrl+X</span>
        </button>

        <button
          onClick={() => { onCopy(); onClose(); }}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5 text-indigo-400" />
            <span>نسخ (Copy)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Ctrl+C</span>
        </button>

        <button
          onClick={() => { onPaste(); onClose(); }}
          disabled={!hasClipboard}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors disabled:opacity-40"
        >
          <div className="flex items-center gap-2">
            <Clipboard className="w-3.5 h-3.5 text-teal-400" />
            <span>لصق كفرع (Paste)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Ctrl+V</span>
        </button>

        <button
          onClick={() => { onDuplicate(); onClose(); }}
          disabled={node.type === 'project'}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] hover:text-[#89b4fa] flex items-center justify-between transition-colors disabled:opacity-40"
        >
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>مضاعفة العنصر (Duplicate)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Ctrl+D</span>
        </button>
      </div>

      <div className="h-px bg-[#313244] my-1" />

      <div className="py-1">
        <button
          onClick={() => { onMoveUp(); onClose(); }}
          disabled={node.type === 'project'}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] flex items-center justify-between transition-colors disabled:opacity-40"
        >
          <div className="flex items-center gap-2">
            <ArrowUp className="w-3.5 h-3.5 text-gray-400" />
            <span>تحريك للأعلى (Move Up)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Alt+↑</span>
        </button>

        <button
          onClick={() => { onMoveDown(); onClose(); }}
          disabled={node.type === 'project'}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] flex items-center justify-between transition-colors disabled:opacity-40"
        >
          <div className="flex items-center gap-2">
            <ArrowDown className="w-3.5 h-3.5 text-gray-400" />
            <span>تحريك للأسفل (Move Down)</span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Alt+↓</span>
        </button>
      </div>

      <div className="h-px bg-[#313244] my-1" />

      <div className="py-1">
        <button
          onClick={() => { onToggleInclude(); onClose(); }}
          className="w-full text-right px-3 py-1.5 hover:bg-[#313244] flex items-center justify-between transition-colors"
        >
          <div className="flex items-center gap-2">
            {node.includeInDoc ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                <span>استثناء من المستند</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>تضمين في المستند</span>
              </>
            )}
          </div>
          <span className="text-[10px] text-gray-500 font-mono">Space</span>
        </button>

        {node.type !== 'project' && (
          <button
            onClick={() => { onToggleRole(); onClose(); }}
            title={isReference ? 'تصبح مادة تُكتب في المقال الجديد' : 'تصبح للربط والاستدلال فقط، ولا تُكتب في المقال'}
            className="w-full text-right px-3 py-1.5 hover:bg-[#313244] flex items-center gap-2 transition-colors"
          >
            {isReference ? (
              <>
                <PenLine className="w-3.5 h-3.5 text-amber-300" />
                <span>تحويل إلى فكرة كتابة</span>
              </>
            ) : (
              <>
                <Pin className="w-3.5 h-3.5 text-sky-400" />
                <span>تحويل إلى فكرة مرجعية</span>
              </>
            )}
          </button>
        )}

        {node.type !== 'project' && (
          <button
            onClick={() => {
              if (window.confirm(`هل أنت متأكد من حذف "${node.arabicLabel}" وجميع العناصر التابعة له؟`)) {
                onDelete();
              }
              onClose();
            }}
            className="w-full text-right px-3 py-1.5 hover:bg-red-950/50 text-red-400 hover:text-red-300 flex items-center justify-between transition-colors"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف العنصر (Delete)</span>
            </div>
            <span className="text-[10px] text-red-400/60 font-mono">Del</span>
          </button>
        )}
      </div>
    </div>
  );
};
