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
    <div className="h-full flex flex-col bg-[#252536] text-[#cdd6f4] select-none text-right font-sans overflow-hidden">
      
      {/* 4-Tab Bar */}
      <div className="h-10 bg-[#161622] border-b border-[#313244] flex items-center justify-between text-xs px-1 flex-shrink-0">
        
        {/* TAB 1: التشابكات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('links')}
          title="شجرة الروابط والتشابكات المعرفية"
          className={`flex-1 h-full flex items-center justify-center gap-1 font-medium transition-all text-[11px] ${
            activeMiddleTab === 'links'
              ? 'border-b-2 border-[#89b4fa] text-[#89b4fa] bg-[#1e1e2d] font-bold shadow-xs'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2d]/50'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span className="truncate">التشابكات</span>
        </button>

        {/* TAB 2: الخصائص */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('params')}
          title="خصائص الفكرة المحددة في الشجرة"
          className={`flex-1 h-full flex items-center justify-center gap-1 font-medium transition-all text-[11px] relative ${
            activeMiddleTab === 'params'
              ? 'border-b-2 border-[#89b4fa] text-[#89b4fa] bg-[#1e1e2d] font-bold shadow-xs'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2d]/50'
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

        {/* TAB 3: الآيات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('verses')}
          title="فهرس الشواهد والآيات القرآنية"
          className={`flex-1 h-full flex items-center justify-center gap-1 font-medium transition-all text-[11px] ${
            activeMiddleTab === 'verses'
              ? 'border-b-2 border-[#89b4fa] text-[#89b4fa] bg-[#1e1e2d] font-bold shadow-xs'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2d]/50'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5" />
          <span className="truncate">الآيات</span>
        </button>

        {/* TAB 4: الإحصائيات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('stats')}
          title="لوحة الإحصائيات وتوزيع الحالات"
          className={`flex-1 h-full flex items-center justify-center gap-1 font-medium transition-all text-[11px] ${
            activeMiddleTab === 'stats'
              ? 'border-b-2 border-[#89b4fa] text-[#89b4fa] bg-[#1e1e2d] font-bold shadow-xs'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2d]/50'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="truncate">الإحصائيات</span>
        </button>

        {/* TAB 5: المقالات */}
        <button
          type="button"
          onClick={() => setActiveMiddleTab('blog')}
          title="مقالات د. رشيد: البحث والتصفح"
          className={`flex-1 h-full flex items-center justify-center gap-1 font-medium transition-all text-[11px] ${
            activeMiddleTab === 'blog'
              ? 'border-b-2 border-[#89b4fa] text-[#89b4fa] bg-[#1e1e2d] font-bold shadow-xs'
              : 'text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#1e1e2d]/50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="truncate">المقالات</span>
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
