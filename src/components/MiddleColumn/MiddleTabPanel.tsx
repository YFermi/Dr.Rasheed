import React from 'react';
import { useIdeaStore } from '../../store/useIdeaStore';
import { LinkNavigator } from '../LinkNavigator/LinkNavigator';
import { ParametersTab } from './ParametersTab';
import { VersesTab } from './VersesTab';
import { StatsTab } from './StatsTab';
import { BlogTab } from '../Blog/BlogTab';
import { Link2, Sliders, BookMarked, BarChart3, BookOpen } from 'lucide-react';

export const MiddleTabPanel: React.FC = () => {
  const { 
    activeMiddleTab, 
    setActiveMiddleTab, 
    selectedNodeId, 
    treeData 
  } = useIdeaStore();

  const isNodeSelected = Boolean(selectedNodeId && selectedNodeId !== treeData.id);

  return (
    <div className="h-full flex flex-col bg-[#171717] text-[#efe6cf] select-none text-right font-sans overflow-hidden">
      
      {/* Tab bar, right to left: الخصائص | المقالات | الآيات | التشابكات | الإحصائيات */}
      <div className="min-h-10 bg-[#0b0b0b] border-b border-[#2e2817] flex items-stretch justify-between text-xs px-1 flex-shrink-0">
        
        {/* TAB 1: الخصائص */}
        <button
          type="button"
          data-tour="params-tab"
          onClick={() => setActiveMiddleTab('params')}
          title="خصائص الفكرة المحددة في الشجرة"
          className={`flex-1 min-w-0 py-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-all fs-11 relative ${
            activeMiddleTab === 'params'
              ? 'border-b-2 border-[#d4af37] text-[#d4af37] bg-[#121212] font-bold shadow-xs'
              : 'text-[#8a7f66] hover:text-[#efe6cf] hover:bg-[#121212]/50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span className="truncate">الخصائص</span>
          {activeMiddleTab !== 'params' && isNodeSelected && (
            <span 
              className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse absolute top-2 right-2"
              title="يوجد فكرة محددة"
            />
          )}
        </button>

        {/* TAB 2: المقالات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('blog')}
          title="مقالات د. رشيد: البحث والتصفح"
          className={`flex-1 min-w-0 py-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-all fs-11 ${
            activeMiddleTab === 'blog'
              ? 'border-b-2 border-[#d4af37] text-[#d4af37] bg-[#121212] font-bold shadow-xs'
              : 'text-[#8a7f66] hover:text-[#efe6cf] hover:bg-[#121212]/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="truncate">المقالات</span>
        </button>

        {/* TAB 3: الآيات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('verses')}
          title="فهرس الشواهد والآيات القرآنية"
          className={`flex-1 min-w-0 py-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-all fs-11 ${
            activeMiddleTab === 'verses'
              ? 'border-b-2 border-[#d4af37] text-[#d4af37] bg-[#121212] font-bold shadow-xs'
              : 'text-[#8a7f66] hover:text-[#efe6cf] hover:bg-[#121212]/50'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span className="truncate">الآيات</span>
        </button>

        {/* TAB 4: التشابكات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('links')}
          title="شجرة الروابط والتشابكات المعرفية"
          className={`flex-1 min-w-0 py-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-all fs-11 ${
            activeMiddleTab === 'links'
              ? 'border-b-2 border-[#d4af37] text-[#d4af37] bg-[#121212] font-bold shadow-xs'
              : 'text-[#8a7f66] hover:text-[#efe6cf] hover:bg-[#121212]/50'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="truncate">التشابكات</span>
        </button>

        {/* TAB 5: الإحصائيات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('stats')}
          title="لوحة الإحصائيات وتوزيع الحالات"
          className={`flex-1 min-w-0 py-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-all fs-11 ${
            activeMiddleTab === 'stats'
              ? 'border-b-2 border-[#d4af37] text-[#d4af37] bg-[#121212] font-bold shadow-xs'
              : 'text-[#8a7f66] hover:text-[#efe6cf] hover:bg-[#121212]/50'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="truncate">الإحصائيات</span>
        </button>
      </div>

      {/* Tab Content Display Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeMiddleTab === 'links' && <LinkNavigator />}
        {activeMiddleTab === 'params' && <ParametersTab />}
        {activeMiddleTab === 'verses' && <VersesTab />}
        {activeMiddleTab === 'stats' && <StatsTab />}
        {activeMiddleTab === 'blog' && <BlogTab />}
      </div>

    </div>
  );
};
