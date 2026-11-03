import React, { useEffect, useMemo, useState } from 'react';
import { useBlogStore } from '../../store/useBlogStore';
import { searchCorpus, toArabicDigits, paragraphNumber } from '../../utils/arabic';
import { findRefArticle, formatBlogRefLabel, formatBlogCitation, makeQuote } from '../../utils/blogLinks';
import { BlogRef } from '../../types/blog';
import { Library, Pencil, Trash2, Plus, Search, X, AlertTriangle } from 'lucide-react';

const MAX_SEARCH_RESULTS = 5;
const PARAGRAPH_OPTION_PREVIEW = 40;

interface BlogRefsSectionProps {
  blogRefs: BlogRef[];
  onChange: (refs: BlogRef[]) => void;
}

// "📚 مراجع المدونة" — the selected node's references to Dr. Rasheed's blog.
// Rendered with key={node.id} so editor/search state resets per node.
export const BlogRefsSection: React.FC<BlogRefsSectionProps> = ({ blogRefs, onChange }) => {
  const { corpus, loadCorpus, openBlogRef } = useBlogStore();

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftParagraphId, setDraftParagraphId] = useState('');
  const [draftQuote, setDraftQuote] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadCorpus();
  }, [loadCorpus]);

  const articles = corpus?.articles ?? [];

  const results = useMemo(
    () => (query.trim() ? searchCorpus(articles, query).slice(0, MAX_SEARCH_RESULTS) : []),
    [articles, query]
  );

  const startEdit = (index: number) => {
    setEditingIndex(index);
    setDraftParagraphId(blogRefs[index].paragraphId ?? '');
    setDraftQuote(blogRefs[index].quote ?? '');
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const updated = blogRefs.map((ref, i) =>
      i === editingIndex
        ? { ...ref, paragraphId: draftParagraphId.trim() || undefined, quote: draftQuote.trim() || undefined }
        : ref
    );
    onChange(updated);
    setEditingIndex(null);
  };

  const handleRemove = (index: number) => {
    onChange(blogRefs.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const handleAddFromResult = (partNumber: number, paragraphId: string, text: string) => {
    if (!blogRefs.some(r => r.paragraphId === paragraphId)) {
      onChange([...blogRefs, { partNumber, paragraphId, quote: makeQuote(text) }]);
    }
    setQuery('');
    setIsSearchOpen(false);
  };

  return (
    <div className="space-y-1.5 border-t border-[#2e2817] pt-2">
      <label className="fs-10.5 font-medium text-[#d4af37] flex items-center gap-1">
        <Library className="w-3 h-3" />
        <span>📚 مراجع المدونة ({toArabicDigits(blogRefs.length)}):</span>
      </label>

      {/* Reference chips */}
      {blogRefs.length > 0 && (
        <div className="space-y-1">
          {blogRefs.map((ref, index) => {
            const article = findRefArticle(articles, ref);
            const isMissing = corpus !== null && !article;
            const isEditing = editingIndex === index;

            return (
              <div key={`${ref.paragraphId ?? ref.partNumber}-${index}`} className="space-y-1">
                <div
                  className={`flex items-center gap-1 p-1 bg-[#0a0a0a] rounded border fs-10.5 transition ${
                    isMissing ? 'border-rose-900/60' : 'border-[#2e2817] hover:border-[#d4af37]/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => openBlogRef(ref)}
                    disabled={!article}
                    title={isMissing ? 'المقال غير موجود في المدونة المحمّلة' : formatBlogCitation(ref, article)}
                    className="flex-1 min-w-0 flex items-center gap-1 text-right disabled:cursor-not-allowed"
                  >
                    {isMissing ? <AlertTriangle className="w-3 h-3 text-rose-400 flex-shrink-0" /> : <span>📖</span>}
                    <span className="text-[#d4af37] font-semibold flex-shrink-0">{formatBlogRefLabel(ref)}</span>
                    {ref.quote && (
                      <span className="text-gray-300 font-quran truncate">"{ref.quote}"</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => (isEditing ? setEditingIndex(null) : startEdit(index))}
                    title="تعديل المرجع"
                    className={`p-0.5 flex-shrink-0 ${isEditing ? 'text-[#d4af37]' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    title="حذف المرجع"
                    className="p-0.5 text-gray-400 hover:text-rose-400 flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {/* Inline editor */}
                {isEditing && (
                  <div className="p-2 bg-[#0a0a0a]/70 border border-[#d4af37]/40 rounded space-y-1.5">
                    <label className="fs-10 text-gray-400 block">الفقرة:</label>
                    {article ? (
                      <select
                        value={draftParagraphId}
                        onChange={(e) => {
                          setDraftParagraphId(e.target.value);
                          const paragraph = article.paragraphs.find(p => p.id === e.target.value);
                          if (paragraph) setDraftQuote(makeQuote(paragraph.text));
                        }}
                        className="w-full bg-[#171717] border border-[#2e2817] rounded px-1.5 py-0.5 text-white fs-10.5 focus:outline-none"
                      >
                        <option value="">-- المقال كاملاً --</option>
                        {article.paragraphs.map(p => (
                          <option key={p.id} value={p.id}>
                            ¶{toArabicDigits(paragraphNumber(p.id))} — {p.text.slice(0, PARAGRAPH_OPTION_PREVIEW)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        dir="ltr"
                        value={draftParagraphId}
                        placeholder="p7-11"
                        onChange={(e) => setDraftParagraphId(e.target.value)}
                        className="w-full bg-[#171717] border border-[#2e2817] rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none"
                      />
                    )}

                    <label className="fs-10 text-gray-400 block">الاقتباس:</label>
                    <textarea
                      rows={2}
                      value={draftQuote}
                      onChange={(e) => setDraftQuote(e.target.value)}
                      className="w-full bg-[#171717] border border-[#2e2817] rounded p-1.5 text-white font-quran text-xs leading-relaxed focus:outline-none"
                    />

                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingIndex(null)}
                        className="px-2 py-0.5 text-gray-400 hover:text-white text-xs"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="px-3 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-semibold"
                      >
                        حفظ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add from blog */}
      {!isSearchOpen ? (
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="w-full px-2 py-1 bg-[#0a0a0a] hover:bg-[#2e2817] border border-dashed border-[#4a4027] text-gray-300 hover:text-white rounded fs-10.5 flex items-center justify-center gap-1 transition"
        >
          <Plus className="w-3 h-3" />
          <span>إضافة مرجع من المدونة</span>
        </button>
      ) : (
        <div className="p-2 bg-[#0a0a0a]/70 border border-[#2e2817] rounded space-y-1.5">
          <div className="flex items-center gap-1.5 bg-[#171717] px-2 py-1 rounded border border-[#2e2817] focus-within:border-[#d4af37]/60">
            <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن الفقرة في المقالات..."
              className="bg-transparent text-xs text-[#efe6cf] placeholder-gray-500 w-full focus:outline-none"
            />
            <button
              type="button"
              onClick={() => { setIsSearchOpen(false); setQuery(''); }}
              title="إغلاق"
              className="text-gray-400 hover:text-white flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {articles.length === 0 ? (
            <div className="fs-10 text-gray-500 text-center py-1">
              لا توجد مقالات محمّلة. شغّل npm run blog بعد وضع الملفات.
            </div>
          ) : query.trim() && results.length === 0 ? (
            <div className="fs-10 text-gray-500 text-center py-1">لا توجد نتائج</div>
          ) : (
            <div className="space-y-1">
              {results.map(({ article, paragraph, snippet }) => {
                const alreadyAdded = blogRefs.some(r => r.paragraphId === paragraph.id);
                return (
                  <button
                    key={paragraph.id}
                    type="button"
                    onClick={() => handleAddFromResult(article.partNumber, paragraph.id, paragraph.text)}
                    disabled={alreadyAdded}
                    className="w-full text-right p-1.5 bg-[#171717] hover:bg-[#2e2817] border border-[#2e2817] rounded space-y-0.5 transition disabled:opacity-50 disabled:cursor-default"
                  >
                    <div className="flex items-center justify-between fs-10">
                      <span className="text-[#d4af37] font-semibold">
                        {formatBlogRefLabel({ partNumber: article.partNumber, paragraphId: paragraph.id })}
                      </span>
                      {alreadyAdded && <span className="text-emerald-400">✓ مضاف</span>}
                    </div>
                    <div className="fs-10.5 text-gray-300 font-quran line-clamp-2">{snippet}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
