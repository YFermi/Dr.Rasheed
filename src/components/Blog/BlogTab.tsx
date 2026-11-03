import React, { useEffect, useMemo, useState } from 'react';
import { useBlogStore } from '../../store/useBlogStore';
import {
  queryStems,
  formatResultCount,
  toArabicDigits,
  paragraphNumber,
} from '../../utils/arabic';
import { BlogArticle, BlogParagraph, BlogVerse } from '../../types/blog';
import {
  BookOpen,
  Search,
  X,
  Loader2,
  FileText,
  BookMarked,
  MapPin,
  ChevronDown,
  ChevronLeft,
  FolderOpen,
} from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 300;
const MAX_RENDERED_RESULTS = 200;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps every occurrence of the query stems in a yellow <mark>.
function highlightStems(text: string, stems: string[]): React.ReactNode {
  if (stems.length === 0) return text;
  const re = new RegExp(`(${stems.map(escapeRegExp).sort((a, b) => b.length - a.length).join('|')})`, 'g');
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-[#fef08a] text-[#121212] font-bold rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function verseLabel(verse: BlogVerse): string {
  if (!verse.surah || verse.ayahFrom === undefined) return 'آية بلا مرجع';
  const range = verse.ayahTo !== undefined && verse.ayahTo !== verse.ayahFrom
    ? `${verse.ayahFrom}-${verse.ayahTo}`
    : `${verse.ayahFrom}`;
  return `${verse.surah}: ${range}`;
}

export const BlogTab: React.FC = () => {
  const {
    corpus,
    isLoading,
    error,
    searchQuery,
    searchResults,
    loadCorpus,
    search,
    openArticle,
    goToParagraph,
  } = useBlogStore();

  const [inputValue, setInputValue] = useState(searchQuery);
  const [articleFilter, setArticleFilter] = useState<string>('all');
  const [versesOnly, setVersesOnly] = useState(false);
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);

  useEffect(() => {
    loadCorpus();
  }, [loadCorpus]);

  // Debounced search
  useEffect(() => {
    if (inputValue === searchQuery) return;
    const timer = setTimeout(() => search(inputValue), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue, searchQuery, search]);

  const handleClear = () => {
    setInputValue('');
    search('');
  };

  const articles = corpus?.articles ?? [];
  const visibleArticles = articleFilter === 'all' ? articles : articles.filter(a => a.id === articleFilter);
  const isSearching = searchQuery.trim().length > 0;
  const stems = useMemo(() => queryStems(searchQuery), [searchQuery]);

  const verseParagraphIds = useMemo(
    () => new Set(articles.flatMap(a => a.verses.map(v => v.paragraphId))),
    [articles]
  );

  const filteredResults = useMemo(
    () =>
      searchResults.filter(r =>
        (articleFilter === 'all' || r.article.id === articleFilter) &&
        (!versesOnly || verseParagraphIds.has(r.paragraph.id))
      ),
    [searchResults, articleFilter, versesOnly, verseParagraphIds]
  );

  const handleRead = (article: BlogArticle, paragraph?: BlogParagraph) => {
    openArticle(article.id, paragraph?.id);
  };

  const handleGoTo = (articleId: string, paragraphId: string) => {
    goToParagraph(articleId, paragraphId);
  };

  const renderActions = (onRead: () => void, onGoTo: () => void) => (
    <div className="flex items-center justify-end gap-1 pt-0.5">
      <button
        type="button"
        onClick={onRead}
        title="فتح المقال في لوحة القراءة"
        className="px-1.5 py-0.5 bg-[#2e2817] hover:bg-[#4a4027] text-[#efe6cf] rounded fs-10 flex items-center gap-0.5 transition"
      >
        <BookOpen className="w-2.5 h-2.5" />
        <span>اقرأ</span>
      </button>
      <button
        type="button"
        onClick={onGoTo}
        title="الانتقال مباشرة إلى الفقرة داخل المقال"
        className="px-1.5 py-0.5 bg-[#d4af37]/90 hover:bg-[#d4af37] text-[#121212] rounded fs-10 font-semibold flex items-center gap-0.5 transition"
      >
        <MapPin className="w-2.5 h-2.5" />
        <span>اذهب</span>
      </button>
    </div>
  );

  // ---- Body states -------------------------------------------------------

  const renderBody = () => {
    if (!corpus && (isLoading || !error)) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
          <Loader2 className="w-5 h-5 animate-spin text-[#d4af37]" />
          <span>جاري تحميل المقالات...</span>
        </div>
      );
    }

    if (error || articles.length === 0) {
      return (
        <div className="p-4 m-2 bg-[#121212] border border-dashed border-[#4a4027] rounded-lg text-center space-y-2">
          <FolderOpen className="w-6 h-6 text-gray-500 mx-auto" />
          <p className="text-xs text-gray-300 leading-relaxed">
            لا توجد مقالات. ضع ملفات Word في المجلد:
          </p>
          <code dir="ltr" className="block fs-10.5 font-mono bg-[#0a0a0a] text-amber-300 px-2 py-1 rounded border border-[#2e2817]">
            content/blog/قصة لوط/
          </code>
          <p className="text-xs text-gray-300">ثم شغّل:</p>
          <code dir="ltr" className="block fs-10.5 font-mono bg-[#0a0a0a] text-emerald-300 px-2 py-1 rounded border border-[#2e2817]">
            npm run blog
          </code>
          {error && <p className="fs-10 text-rose-400 pt-1">{error}</p>}
        </div>
      );
    }

    // Search results
    if (isSearching) {
      if (filteredResults.length === 0) {
        return (
          <div className="p-4 text-center text-gray-500 text-xs font-quran">
            لا توجد فقرات مطابقة للبحث المحدد.
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {filteredResults.slice(0, MAX_RENDERED_RESULTS).map(({ article, paragraph, snippet, matchCount }) => (
            <div
              key={paragraph.id}
              className="p-2 bg-[#121212] border border-[#2e2817] hover:border-[#d4af37]/50 rounded-lg space-y-1 transition"
            >
              <div className="flex items-center gap-1.5 fs-11 min-w-0">
                <FileText className="w-3 h-3 text-[#d4af37] flex-shrink-0" />
                <span className="fs-10 font-mono bg-[#2e2817] text-[#d4af37] px-1.5 rounded flex-shrink-0">
                  {toArabicDigits(article.partNumber)}
                </span>
                <span className="font-bold text-white truncate" title={article.title}>
                  {article.title}
                </span>
              </div>
              <div className="flex items-center justify-between fs-10 text-gray-500">
                <span>¶ الفقرة {toArabicDigits(paragraphNumber(paragraph.id))}</span>
                <span className="font-mono" title="عدد التطابقات">×{toArabicDigits(matchCount)}</span>
              </div>
              <p className="font-quran fs-12.5 leading-relaxed text-[#efe6cf] line-clamp-3 select-text">
                {highlightStems(snippet, stems)}
              </p>
              {renderActions(
                () => handleRead(article, paragraph),
                () => handleGoTo(article.id, paragraph.id)
              )}
            </div>
          ))}
          {filteredResults.length > MAX_RENDERED_RESULTS && (
            <div className="text-center fs-10 text-gray-500 py-1">
              عرض أول {toArabicDigits(MAX_RENDERED_RESULTS)} نتيجة — حدّد البحث أكثر
            </div>
          )}
        </div>
      );
    }

    // Verses-only browser (no query)
    if (versesOnly) {
      const verses = visibleArticles.flatMap(a => a.verses.map(v => ({ article: a, verse: v })));
      if (verses.length === 0) {
        return <div className="p-4 text-center text-gray-500 text-xs font-quran">لا توجد آيات في المقالات المحددة.</div>;
      }
      return (
        <div className="space-y-2">
          {verses.map(({ article, verse }, i) => (
            <div
              key={`${verse.paragraphId}-${i}`}
              className="p-2 bg-[#fef3c7] text-[#78350f] border border-amber-300 rounded-lg space-y-1"
            >
              <div className="flex items-center justify-between fs-10.5 border-b border-amber-200/80 pb-0.5">
                <span className="font-bold text-amber-900">📖 {verseLabel(verse)}</span>
                <span className="fs-9.5 bg-amber-100 text-amber-800 px-1.5 rounded font-mono">
                  المقال {toArabicDigits(article.partNumber)}
                </span>
              </div>
              <p className="font-quran fs-13.5 font-bold leading-relaxed text-center line-clamp-3 select-text">
                ﴿{verse.text}﴾
              </p>
              {renderActions(
                () => handleRead(article, article.paragraphs.find(p => p.id === verse.paragraphId)),
                () => handleGoTo(article.id, verse.paragraphId)
              )}
            </div>
          ))}
        </div>
      );
    }

    // Article browser (no query)
    return (
      <div className="space-y-1.5">
        {visibleArticles.map(article => {
          const isExpanded = expandedArticleId === article.id;
          const headings = article.paragraphs.filter(p => p.isHeading);
          return (
            <div key={article.id} className="bg-[#121212] border border-[#2e2817] rounded-lg overflow-hidden">
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setExpandedArticleId(isExpanded ? null : article.id)}
                  title={isExpanded ? 'طي العناوين' : 'عرض عناوين المقال'}
                  className="px-1.5 text-gray-500 hover:text-white hover:bg-[#2e2817]/60 transition flex-shrink-0"
                >
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleRead(article)}
                  title="فتح المقال في لوحة القراءة"
                  className="flex-1 min-w-0 p-2 pr-0.5 text-right hover:bg-[#2e2817]/40 transition space-y-1"
                >
                  <div className="flex items-center gap-1.5 fs-11 min-w-0">
                    <span className="fs-10 font-mono bg-[#2e2817] text-[#d4af37] px-1.5 rounded flex-shrink-0">
                      {toArabicDigits(article.partNumber)}
                    </span>
                    <span className="font-bold text-white truncate" title={article.title}>
                      {article.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 fs-10 text-gray-500">
                    <span>{toArabicDigits(article.wordCount)} كلمة</span>
                    <span>•</span>
                    <span className="text-amber-300/80">{toArabicDigits(article.verses.length)} آية</span>
                  </div>
                </button>
              </div>

              {isExpanded && (
                <div className="border-t border-[#2e2817] bg-[#0a0a0a] py-1">
                  {headings.length === 0 ? (
                    <div className="px-3 py-1 fs-10 text-gray-500">لا توجد عناوين فرعية.</div>
                  ) : (
                    headings.map(h => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => handleGoTo(article.id, h.id)}
                        className="w-full text-right px-3 py-1 fs-10.5 text-gray-300 hover:text-[#d4af37] hover:bg-[#171717] truncate transition"
                        style={{ paddingRight: `${0.75 + ((h.headingLevel ?? 1) - 1) * 0.6}rem` }}
                        title={h.text}
                      >
                        {h.text}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const hasArticles = articles.length > 0;

  return (
    <div className="h-full flex flex-col bg-[#171717] text-[#efe6cf] select-none text-right font-sans">

      {/* 1. Header */}
      <div className="h-10 px-3 bg-[#121212] border-b border-[#2e2817] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <BookOpen className="w-4 h-4 text-[#d4af37] flex-shrink-0" />
          <span className="font-bold text-xs text-white truncate">مقالات د. رشيد — قصة لوط</span>
          {hasArticles && (
            <span className="fs-10 font-mono bg-[#2e2817] text-[#d4af37] px-1.5 py-0.2 rounded-full border border-blue-900/40">
              {toArabicDigits(articles.length)}
            </span>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="p-2 bg-[#121212]/70 border-b border-[#2e2817] space-y-1.5 flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-[#0a0a0a] px-2 py-1 rounded border border-[#2e2817] focus-within:border-[#d4af37]/60">
          <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="ابحث في مقالات د. رشيد..."
            disabled={!hasArticles}
            className="bg-transparent text-xs text-[#efe6cf] placeholder-gray-500 w-full focus:outline-none disabled:opacity-50"
          />
          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              title="مسح البحث"
              className="text-gray-400 hover:text-white flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isSearching && (
          <div className={`fs-10 ${filteredResults.length ? 'text-[#d4af37]' : 'text-gray-500'}`}>
            {formatResultCount(filteredResults.length)}
          </div>
        )}

        <div className="flex items-center justify-between gap-1.5 fs-11">
          <select
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            disabled={!hasArticles}
            className="flex-1 min-w-0 bg-[#0a0a0a] border border-[#2e2817] rounded px-1.5 py-0.5 text-white fs-10.5 focus:outline-none disabled:opacity-50"
          >
            <option value="all">كل المقالات ({toArabicDigits(articles.length)})</option>
            {articles.map(a => (
              <option key={a.id} value={a.id}>
                {toArabicDigits(a.partNumber)} — {a.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setVersesOnly(!versesOnly)}
            disabled={!hasArticles}
            title="عرض الفقرات التي تحتوي على آيات فقط"
            className={`px-2 py-0.5 rounded border fs-10.5 flex items-center gap-1 flex-shrink-0 transition disabled:opacity-50 ${
              versesOnly
                ? 'bg-amber-600/80 border-amber-500 text-white'
                : 'bg-[#0a0a0a] border-[#2e2817] text-gray-400 hover:text-white'
            }`}
          >
            <BookMarked className="w-3 h-3" />
            <span>الآيات فقط</span>
          </button>
        </div>
      </div>

      {/* 3. Results / Browser */}
      <div className="flex-1 overflow-auto custom-scrollbar scroll-smooth p-2 text-xs">
        {renderBody()}
      </div>

      {/* 4. Bottom Stats Summary */}
      {hasArticles && corpus && (
        <div className="p-2 bg-[#121212] border-t border-[#2e2817] fs-10 text-gray-300 flex items-center justify-between flex-shrink-0">
          <div>
            <span>الفقرات: </span>
            <strong className="text-white font-mono">{toArabicDigits(corpus.totalParagraphs)}</strong>
            <span className="text-gray-500 mx-1">•</span>
            <span>الآيات: </span>
            <strong className="text-amber-300 font-mono">{toArabicDigits(corpus.totalVerses)}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
