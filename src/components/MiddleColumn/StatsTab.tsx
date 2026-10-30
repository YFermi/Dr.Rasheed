import React, { useEffect } from 'react';
import { useIdeaStore, getAllNodeList } from '../../store/useIdeaStore';
import { useBlogStore } from '../../store/useBlogStore';
import { formatArabicCount, toArabicDigits, containsQuranGlyphs } from '../../utils/arabic';
import { countSharedTreeVerses, findRefArticle } from '../../utils/blogLinks';
import { 
  BarChart3, 
  Layers, 
  Lightbulb, 
  BookOpen, 
  Link2, 
  CheckCircle2, 
  Users, 
  FileText,
  PieChart,
  TrendingUp
} from 'lucide-react';
import { IdeaNode, NodeStatus, IdeaSource } from '../../types';

export const StatsTab: React.FC = () => {
  const { treeData, projectSettings } = useIdeaStore();

  const allNodes = getAllNodeList(treeData);
  const axes = allNodes.filter(n => n.type === 'axis');
  const ideas = allNodes.filter(n => n.type === 'idea');
  const evidences = allNodes.filter(n => n.type === 'evidence');
  const questions = allNodes.filter(n => n.type === 'question');

  // Count links
  let totalLinks = 0;
  allNodes.forEach(n => {
    totalLinks += n.linkedIdeas.length;
  });

  // Count verses
  const versesCount = allNodes.filter(n => n.quranicVerses && n.quranicVerses.trim()).length;

  // Status breakdown
  const statusCounts: Record<NodeStatus, number> = {
    published: 0,
    draft: 0,
    brainstorm: 0,
    deferred: 0,
    rejected: 0,
  };

  allNodes.filter(n => n.type !== 'project').forEach(n => {
    statusCounts[n.status] = (statusCounts[n.status] || 0) + 1;
  });

  const totalNonRoot = allNodes.length - 1;

  // Source breakdown
  const sourceCounts: Record<IdeaSource, number> = {
    rasheed_article: 0,
    brainstorm_session: 0,
    mostafa_outline: 0,
    external_reference: 0,
  };

  allNodes.filter(n => n.type !== 'project').forEach(n => {
    sourceCounts[n.source] = (sourceCounts[n.source] || 0) + 1;
  });

  // Speaker contributions
  const speakerCounts: Record<string, number> = {};
  allNodes.filter(n => n.type !== 'project').forEach(n => {
    n.speakers.forEach(spk => {
      speakerCounts[spk] = (speakerCounts[spk] || 0) + 1;
    });
  });

  const sortedSpeakers = Object.entries(speakerCounts).sort((a, b) => b[1] - a[1]);

  // Axis completion (based on published vs total in axis)
  const axisCompletion = axes.map(axis => {
    const axisSubNodes = axis.children ? getAllNodeList(axis).filter(n => n.id !== axis.id) : [];
    const total = axisSubNodes.length || 1;
    const published = axisSubNodes.filter(n => n.status === 'published').length;
    const percent = Math.round((published / total) * 100);
    return {
      axis,
      total,
      published,
      percent: axis.status === 'published' ? Math.max(percent, 80) : percent,
    };
  });

  // Document word count calculation
  let totalDocWords = 0;
  function countWordsInNode(node: IdeaNode) {
    if (!node.includeInDoc) return;
    const textToCount = `${node.arabicLabel} ${node.notes || ''} ${node.quranicVerses || ''}`;
    const words = textToCount.trim().split(/\s+/).filter(Boolean).length;
    totalDocWords += words;
    if (node.children) {
      node.children.forEach(countWordsInNode);
    }
  }
  countWordsInNode(treeData);

  const estimatedPages = Math.max(1, Math.ceil(totalDocWords / 320));

  // Blog corpus statistics
  const { corpus, loadCorpus } = useBlogStore();
  useEffect(() => {
    loadCorpus();
  }, [loadCorpus]);

  const blogArticles = corpus?.articles ?? [];
  const allBlogRefs = allNodes.flatMap(n => n.blogRefs ?? []);
  const citationsByArticle = new Map<string, { label: string; count: number }>();
  allBlogRefs.forEach(ref => {
    const article = findRefArticle(blogArticles, ref);
    const key = article?.id ?? `part-${ref.partNumber}`;
    const entry = citationsByArticle.get(key) ?? { label: `المقال ${toArabicDigits(ref.partNumber)}`, count: 0 };
    entry.count++;
    citationsByArticle.set(key, entry);
  });
  const mostCitedArticle = [...citationsByArticle.values()].sort((a, b) => b.count - a.count)[0];
  const sharedVerses = countSharedTreeVerses(allNodes, blogArticles);
  const blogVerses = blogArticles.flatMap(a => a.verses);
  const canonicalVerses = blogVerses.filter(v => v.replacedFromGlyphs).length;
  const versesNeedingReview = blogVerses.filter(v => !v.replacedFromGlyphs && containsQuranGlyphs(v.text)).length;

  return (
    <div className="h-full flex flex-col bg-[#252536] text-[#cdd6f4] select-none text-right font-sans">
      
      {/* Header */}
      <div className="h-10 px-3 bg-[#1e1e2d] border-b border-[#313244] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-xs text-white">لوحة الإحصائيات (Statistics Dashboard)</span>
        </div>
        <span className="text-[10px] text-gray-400 font-mono">
          {totalNonRoot} عنصر
        </span>
      </div>

      {/* Stats Body */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3 space-y-4 text-xs">
        
        {/* 1. Overview 2x2 Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 bg-[#181825] border border-blue-900/40 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">المحاور (Axes)</span>
              <span className="text-xl font-bold font-mono text-blue-400">{axes.length}</span>
            </div>
            <span className="text-xl">📐</span>
          </div>

          <div className="p-2.5 bg-[#181825] border border-amber-900/40 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">الأفكار (Ideas)</span>
              <span className="text-xl font-bold font-mono text-amber-400">{ideas.length}</span>
            </div>
            <span className="text-xl">💡</span>
          </div>

          <div className="p-2.5 bg-[#181825] border border-emerald-900/40 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">الآيات والشواهد</span>
              <span className="text-xl font-bold font-mono text-emerald-400">{versesCount}</span>
            </div>
            <span className="text-xl">📖</span>
          </div>

          <div className="p-2.5 bg-[#181825] border border-indigo-900/40 rounded-lg flex items-center justify-between">
            <div>
              <span className="text-[10px] text-gray-400 block">التشابكات (Links)</span>
              <span className="text-xl font-bold font-mono text-indigo-400">{totalLinks}</span>
            </div>
            <span className="text-xl">🔗</span>
          </div>
        </div>

        {/* 2. Status Breakdown */}
        <div className="p-3 bg-[#1e1e2d] border border-[#313244] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-200">
            <span>توزيع الحالات (Status Breakdown):</span>
            <span className="text-[10px] text-gray-400 font-mono">100%</span>
          </div>

          <div className="space-y-1.5 text-[11px]">
            {/* Published */}
            <div>
              <div className="flex justify-between text-[10.5px] mb-0.5">
                <span className="text-emerald-400 flex items-center gap-1">
                  <span>🟢 منشور (Published)</span>
                </span>
                <span className="font-mono text-gray-300">
                  {statusCounts.published} ({Math.round((statusCounts.published / totalNonRoot) * 100 || 0)}%)
                </span>
              </div>
              <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                <div 
                  style={{ width: `${(statusCounts.published / totalNonRoot) * 100}%` }}
                  className="h-full bg-emerald-500 rounded-full transition-all"
                />
              </div>
            </div>

            {/* Draft */}
            <div>
              <div className="flex justify-between text-[10.5px] mb-0.5">
                <span className="text-amber-400 flex items-center gap-1">
                  <span>🟡 مسودة (Draft)</span>
                </span>
                <span className="font-mono text-gray-300">
                  {statusCounts.draft} ({Math.round((statusCounts.draft / totalNonRoot) * 100 || 0)}%)
                </span>
              </div>
              <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                <div 
                  style={{ width: `${(statusCounts.draft / totalNonRoot) * 100}%` }}
                  className="h-full bg-amber-400 rounded-full transition-all"
                />
              </div>
            </div>

            {/* Brainstorm */}
            <div>
              <div className="flex justify-between text-[10.5px] mb-0.5">
                <span className="text-blue-400 flex items-center gap-1">
                  <span>🔵 عصف (Brainstorm)</span>
                </span>
                <span className="font-mono text-gray-300">
                  {statusCounts.brainstorm} ({Math.round((statusCounts.brainstorm / totalNonRoot) * 100 || 0)}%)
                </span>
              </div>
              <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                <div 
                  style={{ width: `${(statusCounts.brainstorm / totalNonRoot) * 100}%` }}
                  className="h-full bg-blue-400 rounded-full transition-all"
                />
              </div>
            </div>

            {/* Deferred */}
            <div>
              <div className="flex justify-between text-[10.5px] mb-0.5">
                <span className="text-rose-400 flex items-center gap-1">
                  <span>🔴 مؤجل (Deferred)</span>
                </span>
                <span className="font-mono text-gray-300">
                  {statusCounts.deferred} ({Math.round((statusCounts.deferred / totalNonRoot) * 100 || 0)}%)
                </span>
              </div>
              <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                <div 
                  style={{ width: `${(statusCounts.deferred / totalNonRoot) * 100}%` }}
                  className="h-full bg-rose-500 rounded-full transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Source Breakdown */}
        <div className="p-3 bg-[#1e1e2d] border border-[#313244] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-200">
            <span>مصادر الأفكار (Source Breakdown):</span>
          </div>

          <div className="space-y-1.5 text-[10.5px]">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">مقال د. رشيد</span>
              <span className="font-mono text-blue-300 font-semibold">{sourceCounts.rasheed_article} ({Math.round((sourceCounts.rasheed_article / totalNonRoot) * 100)}%)</span>
            </div>
            <div className="h-1 bg-[#181825] rounded-full overflow-hidden">
              <div style={{ width: `${(sourceCounts.rasheed_article / totalNonRoot) * 100}%` }} className="h-full bg-blue-500" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-300">جلسات العصف الذهني</span>
              <span className="font-mono text-indigo-300 font-semibold">{sourceCounts.brainstorm_session} ({Math.round((sourceCounts.brainstorm_session / totalNonRoot) * 100)}%)</span>
            </div>
            <div className="h-1 bg-[#181825] rounded-full overflow-hidden">
              <div style={{ width: `${(sourceCounts.brainstorm_session / totalNonRoot) * 100}%` }} className="h-full bg-indigo-500" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-300">محاور مصطفى</span>
              <span className="font-mono text-amber-300 font-semibold">{sourceCounts.mostafa_outline} ({Math.round((sourceCounts.mostafa_outline / totalNonRoot) * 100)}%)</span>
            </div>
            <div className="h-1 bg-[#181825] rounded-full overflow-hidden">
              <div style={{ width: `${(sourceCounts.mostafa_outline / totalNonRoot) * 100}%` }} className="h-full bg-amber-500" />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-gray-300">مراجع خارجية</span>
              <span className="font-mono text-teal-300 font-semibold">{sourceCounts.external_reference} ({Math.round((sourceCounts.external_reference / totalNonRoot) * 100)}%)</span>
            </div>
            <div className="h-1 bg-[#181825] rounded-full overflow-hidden">
              <div style={{ width: `${(sourceCounts.external_reference / totalNonRoot) * 100}%` }} className="h-full bg-teal-500" />
            </div>
          </div>
        </div>

        {/* 4. Speaker Contribution */}
        <div className="p-3 bg-[#1e1e2d] border border-[#313244] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-200">
            <span>مساهمات المتحدثين (Speaker Contribution):</span>
          </div>

          <div className="space-y-1.5">
            {sortedSpeakers.map(([spk, count]) => {
              const maxCount = sortedSpeakers[0]?.[1] || 1;
              const barPercent = Math.round((count / maxCount) * 100);
              return (
                <div key={spk} className="space-y-0.5">
                  <div className="flex justify-between text-[10.5px]">
                    <span className="font-bold text-gray-300">{spk}</span>
                    <span className="font-mono text-indigo-300">{count} فكرة</span>
                  </div>
                  <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                    <div style={{ width: `${barPercent}%` }} className="h-full bg-indigo-500 rounded-full" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Axis Completion Progress */}
        <div className="p-3 bg-[#1e1e2d] border border-[#313244] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-200">
            <span>إنجاز المحاور (Axis Completion):</span>
          </div>

          <div className="space-y-2">
            {axisCompletion.map(({ axis, percent }) => (
              <div key={axis.id} className="space-y-0.5">
                <div className="flex justify-between text-[10.5px]">
                  <span className="font-quran font-bold text-gray-300 truncate max-w-[160px]">
                    {axis.arabicLabel}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{percent}%</span>
                </div>
                <div className="h-1.5 bg-[#181825] rounded-full overflow-hidden">
                  <div 
                    style={{ width: `${percent}%` }} 
                    className={`h-full rounded-full transition-all ${
                      percent >= 80 ? 'bg-emerald-500' :
                      percent >= 50 ? 'bg-blue-500' :
                      'bg-amber-500'
                    }`} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Document Word Count & Estimated Pages */}
        <div className="p-3 bg-gradient-to-tr from-blue-950/40 to-indigo-950/40 border border-blue-800/40 rounded-lg flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] text-blue-300 block">إحصاء كلمات المستند:</span>
            <div className="flex items-center gap-2">
              <span className="font-bold font-mono text-base text-white">{totalDocWords}</span>
              <span className="text-[10px] text-gray-400">كلمة</span>
            </div>
          </div>
          <div className="text-left space-y-0.5 border-r border-blue-800/40 pr-3">
            <span className="text-[10px] text-blue-300 block">الصفحات التقديرية (A4):</span>
            <span className="font-bold font-mono text-base text-emerald-400">{estimatedPages} صفحات</span>
          </div>
        </div>

        {/* 7. Blog Corpus Statistics */}
        <div className="p-3 bg-[#1e1e2d] border border-[#313244] rounded-lg space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-200">
            <span>📚 إحصائيات المدونة:</span>
          </div>

          {blogArticles.length === 0 ? (
            <div className="text-[10.5px] text-gray-500">
              لا توجد مقالات محمّلة. ضع ملفات Word في content/blog/قصة لوط/ ثم شغّل npm run blog.
            </div>
          ) : (
            <>
              <div className="space-y-1 text-[10.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">المقالات المحمّلة</span>
                  <span className="font-mono text-blue-300 font-semibold">{corpus?.totalArticles}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">إجمالي الفقرات</span>
                  <span className="font-mono text-gray-200 font-semibold">{corpus?.totalParagraphs}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">الآيات في المدونة</span>
                  <span className="font-mono text-amber-300 font-semibold">{corpus?.totalVerses}</span>
                </div>
                <div className="flex items-center justify-between" title="نص الآية مأخوذ من مشروع تنزيل (tanzil.net) بدلاً من رموز خط المصحف">
                  <span className="text-gray-300">آيات بنص قرآني موثق</span>
                  <span className="font-mono text-emerald-400 font-semibold">{canonicalVerses}</span>
                </div>
                {versesNeedingReview > 0 && (
                  <div className="flex items-center justify-between" title="آيات بقيت برموز خط المصحف لعدم وجود مرجع (سورة: آية) بعدها">
                    <span className="text-gray-300">آيات بحاجة للمراجعة اليدوية</span>
                    <span className="font-mono text-rose-400 font-semibold">{versesNeedingReview}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-300">المراجع في الشجرة</span>
                  <span className="font-mono text-indigo-300 font-semibold">{allBlogRefs.length}</span>
                </div>
              </div>

              <div className="pt-1.5 border-t border-[#313244] text-[10.5px] space-y-0.5">
                <span className="text-gray-400 block">أكثر مقال استشهاداً:</span>
                {mostCitedArticle ? (
                  <span className="text-white font-semibold">
                    {mostCitedArticle.label} ({formatArabicCount(mostCitedArticle.count, {
                      zero: 'لا مراجع', one: 'مرجع واحد', two: 'مرجعان', few: 'مراجع', many: 'مرجعاً',
                    })})
                  </span>
                ) : (
                  <span className="text-gray-500">لا توجد مراجع بعد</span>
                )}
              </div>

              <div className="pt-1.5 border-t border-[#313244] flex items-center justify-between text-[10.5px]">
                <span className="text-gray-300">آيات مشتركة (شجرة + مدونة)</span>
                <span className="font-mono text-emerald-400 font-semibold">{sharedVerses}</span>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
