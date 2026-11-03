import React, { useState, useEffect } from 'react';
import { useIdeaStore, getAllNodeList } from '../../store/useIdeaStore';
import { useBlogStore } from '../../store/useBlogStore';
import { IdeaNode } from '../../types';
import { normalizeArabic, toArabicDigits, paragraphNumber } from '../../utils/arabic';
import {
  BlogVerseMatch,
  findBlogMatches,
  groupBlogVerses,
  uniqueByParagraph,
  verseReference,
} from '../../utils/blogLinks';
import {
  BookMarked,
  Search,
  Plus,
  ExternalLink,
  Quote,
  Check,
  X,
  Sparkles,
  MapPin
} from 'lucide-react';

interface VerseItem {
  id: string;
  surah: string;
  ayah: string;
  fullReference: string;
  text: string;
  referencingIdeas: { id: string; label: string; axisLabel?: string }[];
  origin: 'tree' | 'blog';
  blogMatches: BlogVerseMatch[];
}

type VerseViewMode = 'all' | 'tree' | 'blog' | 'shared';

const VIEW_MODES: { id: VerseViewMode; label: string }[] = [
  { id: 'all', label: 'كل الآيات' },
  { id: 'tree', label: 'في الشجرة فقط' },
  { id: 'blog', label: 'في المدونة فقط' },
  { id: 'shared', label: 'مشتركة' },
];

export const VersesTab: React.FC = () => {
  const {
    treeData,
    selectNode,
    updateNode,
    setActiveMiddleTab
  } = useIdeaStore();
  const { corpus, loadCorpus, goToParagraph } = useBlogStore();

  const [searchText, setSearchText] = useState('');
  const [selectedSurah, setSelectedSurah] = useState('all');
  const [viewMode, setViewMode] = useState<VerseViewMode>('all');
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  useEffect(() => {
    loadCorpus();
  }, [loadCorpus]);

  // New verse form states
  const [newSurah, setNewSurah] = useState('الأعراف');
  const [newAyah, setNewAyah] = useState('');
  const [newText, setNewText] = useState('');
  const [targetIdeaId, setTargetIdeaId] = useState('');

  const allNodes = getAllNodeList(treeData);

  // Extract all verses mentioned across all nodes in the tree
  const versesMap = new Map<string, VerseItem>();

  allNodes.forEach(node => {
    if (node.quranicVerses && node.quranicVerses.trim()) {
      const rawText = node.quranicVerses.trim();
      
      // Extract Surah and Ayah if present in brackets [سورة: رقم]
      const refMatch = rawText.match(/\[(.*?)\]/) || rawText.match(/\((.*?)\)/);
      let surah = 'سورة متعددة';
      let ayah = '';
      let refLabel = 'شاهد قرآني';

      if (refMatch && refMatch[1]) {
        refLabel = refMatch[1];
        const parts = refLabel.split(':');
        surah = parts[0].trim();
        ayah = parts[1]?.trim() || '';
      } else {
        // Fallback guess from common surahs
        if (rawText.includes('الأعراف')) surah = 'الأعراف';
        else if (rawText.includes('الحجر')) surah = 'الحجر';
        else if (rawText.includes('النمل')) surah = 'النمل';
        else if (rawText.includes('العنكبوت')) surah = 'العنكبوت';
        else if (rawText.includes('الشعراء')) surah = 'الشعراء';
        else if (rawText.includes('التحريم')) surah = 'التحريم';
        else if (rawText.includes('إبراهيم')) surah = 'إبراهيم';
        else if (rawText.includes('البقرة')) surah = 'البقرة';
        else if (rawText.includes('طه')) surah = 'طه';
        else if (rawText.includes('النساء')) surah = 'النساء';
      }

      const key = rawText.slice(0, 50);

      // Find parent axis label
      const parentAxis = allNodes.find(a => 
        a.type === 'axis' && a.children && getAllNodeList(a).some(c => c.id === node.id)
      );

      if (!versesMap.has(key)) {
        versesMap.set(key, {
          id: `verse-${versesMap.size + 1}`,
          surah,
          ayah,
          fullReference: refLabel,
          text: rawText,
          referencingIdeas: [],
          origin: 'tree',
          blogMatches: [],
        });
      }

      const entry = versesMap.get(key)!;
      if (!entry.referencingIdeas.some(i => i.id === node.id)) {
        entry.referencingIdeas.push({
          id: node.id,
          label: node.arabicLabel,
          axisLabel: parentAxis?.arabicLabel,
        });
      }
    }
  });

  const treeVersesList = Array.from(versesMap.values());

  // Cross-index with the blog corpus
  const blogArticles = corpus?.articles ?? [];
  treeVersesList.forEach(v => {
    v.blogMatches = findBlogMatches(v.text, blogArticles);
  });

  // Blog verses that no tree verse matches, grouped by reference
  const matchedBlogVerses = new Set(treeVersesList.flatMap(v => v.blogMatches.map(m => m.verse)));
  const blogOnlyVerses: VerseItem[] = groupBlogVerses(
    blogArticles.flatMap(article =>
      article.verses.filter(verse => !matchedBlogVerses.has(verse)).map(verse => ({ article, verse }))
    )
  ).map((group, i) => {
    const first = group[0].verse;
    return {
      id: `blog-verse-${i + 1}`,
      surah: first.surah ?? 'آية بلا مرجع',
      ayah: first.ayahFrom !== undefined ? String(first.ayahFrom) : '',
      fullReference: verseReference(first) ?? '',
      text: `﴿${first.text}﴾`,
      referencingIdeas: [],
      origin: 'blog',
      blogMatches: group,
    };
  });

  const versesList = [...treeVersesList, ...blogOnlyVerses];

  // Unique surahs for dropdown
  const uniqueSurahs = Array.from(new Set(versesList.map(v => v.surah).filter(Boolean)));

  // Filter verses
  const filteredVerses = versesList.filter(v => {
    const inBlog = v.blogMatches.length > 0;
    if (viewMode === 'tree' && (v.origin !== 'tree' || inBlog)) return false;
    if (viewMode === 'blog' && v.origin !== 'blog') return false;
    if (viewMode === 'shared' && (v.origin !== 'tree' || !inBlog)) return false;
    if (selectedSurah !== 'all' && v.surah !== selectedSurah) return false;
    if (searchText.trim()) {
      // Normalized so diacritized verse text matches a plain query
      const q = normalizeArabic(searchText).toLowerCase();
      const matchText = normalizeArabic(v.text).toLowerCase().includes(q);
      const matchSurah = normalizeArabic(v.surah).toLowerCase().includes(q);
      const matchIdeas = v.referencingIdeas.some(i => normalizeArabic(i.label).toLowerCase().includes(q));
      if (!matchText && !matchSurah && !matchIdeas) return false;
    }
    return true;
  });

  // Calculate statistics (tree verses only, as before)
  const totalVerses = treeVersesList.length;
  const surahsCovered = new Set(treeVersesList.map(v => v.surah).filter(Boolean)).size;
  const mostReferenced = [...treeVersesList].sort((a, b) => b.referencingIdeas.length - a.referencingIdeas.length)[0];

  const handleGoToIdea = (nodeId: string) => {
    selectNode(nodeId);
    setActiveMiddleTab('params');
    const el = document.getElementById(`preview-node-${nodeId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleAddVerseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !targetIdeaId) return;

    const formattedVerse = `﴿${newText.trim().replace(/^﴿|﴾$/g, '')}﴾ [${newSurah}${newAyah ? `:${newAyah}` : ''}]`;
    const targetNode = allNodes.find(n => n.id === targetIdeaId);
    if (targetNode) {
      const existing = targetNode.quranicVerses ? `${targetNode.quranicVerses}\n\n` : '';
      updateNode(targetIdeaId, {
        quranicVerses: `${existing}${formattedVerse}`
      });
      setIsAddFormOpen(false);
      setNewText('');
      setNewAyah('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#171717] text-[#efe6cf] select-none text-right font-sans">
      
      {/* 1. Header with Add Button */}
      <div className="h-10 px-3 bg-[#121212] border-b border-[#2e2817] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BookMarked className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-xs text-white">فهرس الشواهد والآيات</span>
          <span className="fs-10 font-mono bg-[#2e2817] text-amber-300 px-1.5 py-0.2 rounded-full border border-amber-900/40">
            {totalVerses}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsAddFormOpen(!isAddFormOpen)}
          className="px-2 py-0.5 bg-amber-600/80 hover:bg-amber-500 text-white rounded fs-11 flex items-center gap-1 transition"
        >
          <Plus className="w-3 h-3" />
          <span>إضافة شاهد</span>
        </button>
      </div>

      {/* Add Verse Form (Collapsible) */}
      {isAddFormOpen && (
        <form onSubmit={handleAddVerseSubmit} className="p-3 bg-[#0a0a0a] border-b border-amber-600/40 space-y-2 text-xs">
          <div className="flex items-center justify-between text-amber-300 font-bold fs-11">
            <span>إضافة شاهد قرآني جديد لفكرة:</span>
            <button type="button" onClick={() => setIsAddFormOpen(false)} className="text-gray-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="fs-10 text-gray-400 block mb-0.5">السورة:</label>
              <input
                type="text"
                value={newSurah}
                onChange={(e) => setNewSurah(e.target.value)}
                className="w-full bg-[#171717] border border-[#2e2817] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="fs-10 text-gray-400 block mb-0.5">رقم الآية:</label>
              <input
                type="text"
                placeholder="81"
                value={newAyah}
                onChange={(e) => setNewAyah(e.target.value)}
                className="w-full bg-[#171717] border border-[#2e2817] rounded px-1.5 py-0.5 text-white text-xs focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="fs-10 text-gray-400 block mb-0.5">نص الآية الكريمة:</label>
            <textarea
              rows={2}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="اكتب الآية بدون أقواس (سيتم وضع ﴿ ﴾ تلقائياً)..."
              className="w-full bg-[#171717] border border-[#2e2817] rounded p-1.5 text-amber-200 font-quran text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="fs-10 text-gray-400 block mb-0.5">ربط بالفكرة:</label>
            <select
              value={targetIdeaId}
              onChange={(e) => setTargetIdeaId(e.target.value)}
              className="w-full bg-[#171717] border border-[#2e2817] rounded px-1.5 py-1 text-white fs-11 focus:outline-none"
              required
            >
              <option value="">-- اختر الفكرة لإلحاق الشاهد بها --</option>
              {allNodes.filter(n => n.type !== 'project').map(n => (
                <option key={n.id} value={n.id}>
                  {n.type === 'axis' ? '📐 ' : '💡 '} {n.arabicLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setIsAddFormOpen(false)}
              className="px-2 py-0.5 text-gray-400 hover:text-white text-xs"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
            >
              حفظ وإدراج
            </button>
          </div>
        </form>
      )}

      {/* 2. Search & Surah Filter Bar */}
      <div className="p-2 bg-[#121212]/70 border-b border-[#2e2817] space-y-1.5">
        {/* Tree / blog view toggle */}
        <div className="flex flex-wrap gap-0.5 p-0.5 bg-[#0a0a0a] rounded border border-[#2e2817]">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setViewMode(mode.id)}
              className={`flex-1 px-1 py-0.5 rounded fs-9.5 whitespace-nowrap transition ${
                viewMode === mode.id
                  ? 'bg-amber-600/80 text-white font-bold'
                  : 'text-gray-400 hover:text-white hover:bg-[#2e2817]/60'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 bg-[#0a0a0a] px-2 py-1 rounded border border-[#2e2817]">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="بحث في نصوص وشواهد الآيات..."
            className="bg-transparent text-xs text-[#efe6cf] placeholder-gray-500 w-full focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-between fs-11">
          <span className="text-gray-400 fs-10">تصفية بالسورة:</span>
          <select
            value={selectedSurah}
            onChange={(e) => setSelectedSurah(e.target.value)}
            className="bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-0.5 text-white fs-10.5 focus:outline-none"
          >
            <option value="all">كافة السور ({uniqueSurahs.length})</option>
            {uniqueSurahs.map(surah => (
              <option key={surah} value={surah}>
                {surah}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Verses Scroll List */}
      <div className="flex-1 overflow-auto custom-scrollbar p-2 space-y-2.5 text-xs">
        {filteredVerses.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs font-quran">
            لا توجد آيات مطابقة للبحث المحدد.
          </div>
        ) : (
          filteredVerses.map(verse => (
            <div
              key={verse.id}
              className="p-3 bg-[#fef3c7] text-[#78350f] border border-amber-300 rounded-lg shadow-xs space-y-2 select-text"
            >
              {/* Surah & Ayah Badge */}
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-1 fs-11">
                <div className="flex items-center gap-1 font-bold text-amber-900">
                  <span className="text-xs">📖</span>
                  <span>{verse.fullReference ? verse.fullReference : `${verse.surah} ${verse.ayah}`}</span>
                </div>
                {verse.origin === 'tree' ? (
                  <span className="fs-10 bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono font-semibold">
                    مستشهد به {verse.referencingIdeas.length}x
                  </span>
                ) : (
                  <span className="fs-10 bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold">
                    في المدونة فقط
                  </span>
                )}
              </div>

              {/* Verse Text in Amiri 14pt */}
              <p className="font-quran fs-15 font-bold leading-relaxed text-center py-1 selection:bg-amber-300">
                {verse.text}
              </p>

              {/* Referenced Ideas List */}
              {verse.origin === 'tree' && (
              <div className="pt-1.5 border-t border-amber-200/80 fs-10.5 space-y-1">
                <span className="text-amber-900/80 font-bold block fs-10">
                  في الشجرة:
                </span>
                <div className="space-y-1">
                  {verse.referencingIdeas.map(idea => (
                    <div
                      key={idea.id}
                      className="flex items-center justify-between p-1 bg-white/70 hover:bg-white rounded border border-amber-200 transition fs-10.5"
                    >
                      <span className="font-quran text-gray-900 font-semibold truncate flex-1" title={idea.label}>
                        💡 {idea.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleGoToIdea(idea.id)}
                        className="px-1.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded fs-9.5 flex items-center gap-0.5 flex-shrink-0 transition mr-1 font-sans"
                        title="انتقال للفكرة وتعديل خصائصها"
                      >
                        <MapPin className="w-2.5 h-2.5" />
                        <span>انتقال</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* Occurrences in the blog corpus */}
              {verse.blogMatches.length > 0 && (
                <div className="pt-1.5 border-t border-amber-200/80 fs-10.5 space-y-1">
                  <span className="text-amber-900/80 font-bold block fs-10">
                    في المدونة:
                  </span>
                  <div className="space-y-1">
                    {uniqueByParagraph(verse.blogMatches).map(({ article, verse: blogVerse }) => (
                      <div
                        key={blogVerse.paragraphId}
                        className="flex items-center justify-between p-1 bg-white/70 hover:bg-white rounded border border-amber-200 transition fs-10.5"
                      >
                        <span className="text-gray-900 font-semibold truncate flex-1" title={article.title}>
                          📄 المقال {toArabicDigits(article.partNumber)} ¶{toArabicDigits(paragraphNumber(blogVerse.paragraphId))}
                        </span>
                        <button
                          type="button"
                          onClick={() => goToParagraph(article.id, blogVerse.paragraphId)}
                          className="px-1.5 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded fs-9.5 flex items-center gap-0.5 flex-shrink-0 transition mr-1 font-sans"
                          title="فتح المقال عند هذه الفقرة"
                        >
                          <MapPin className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 4. Bottom Stats Summary */}
      <div className="p-2 bg-[#121212] border-t border-[#2e2817] fs-10 text-gray-300 flex items-center justify-between">
        <div>
          <span>إجمالي الآيات: </span>
          <strong className="text-amber-300 font-mono fs-11">{totalVerses}</strong>
          <span className="text-gray-500 mx-1">•</span>
          <span>السور المغطاة: </span>
          <strong className="text-white font-mono">{surahsCovered}</strong>
        </div>
        {mostReferenced && (
          <div className="truncate max-w-[140px] text-gray-400" title={mostReferenced.fullReference}>
            الأكثر: <span className="text-amber-300 font-quran">{mostReferenced.surah}</span>
          </div>
        )}
      </div>

    </div>
  );
};
