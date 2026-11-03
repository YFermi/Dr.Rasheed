import { IdeaNode, ProjectSettings } from '../types';
import { formatProjectDate } from '../utils/projectDate';

// The researcher is always Dr. Rasheed (read-only in the parameters)
export const PROJECT_RESEARCHER = 'أ.د. رشيد الجراح';
// Shown in place of an empty title (placeholder, not stored)
export const PROJECT_TITLE_PLACEHOLDER = 'أدخل عنوان المشروع هنا';

// A new project: no title yet, today's date, an empty foreword (التوطئة) that
// later collects the articles' summaries
export function newProjectSettings(): ProjectSettings {
  return {
    title: '',
    subtitle: '',
    author: PROJECT_RESEARCHER,
    date: formatProjectDate(),
    description: '',
    fontSize: 'normal',
    showQuranGoldenBox: true,
  };
}

export const initialProjectSettings: ProjectSettings = newProjectSettings();

// The sample project's defaults, replaced in projects saved before they changed
export const LEGACY_DEFAULT_SETTINGS = {
  title: 'قصة لوط - بحث شامل ومقاربات تأصيلية',
  subtitle: 'تفكيك بنية الفاحشة، الإبصار، والسبيل في الخطاب القرآني',
  date: 'رجب 1448 هـ / 2026 م',
  description: 'مشروع بحثي منهجي يستنطق دلالات المفردات القرآنية في سياق قصة لوط عليه السلام، مستخلص من جلسات العصف الذهني المشتركة.',
};

// The app starts with an empty tree: a reference article (📄 مقال مرجعي) and a
// brainstorm session (استيراد نص عصف) each add their own root axis.
export const initialTreeData: IdeaNode = {
  id: 'root-project',
  name: 'Project',
  arabicLabel: 'المشروع',
  type: 'project',
  status: 'draft',
  priority: 'high',
  source: 'brainstorm_session',
  sessionRef: '',
  speakers: [],
  targetArticle: '',
  quranicVerses: '',
  crossReferences: [],
  linkedIdeas: [],
  notes: '',
  includeInDoc: true,
  collapsed: false,
  children: [],
};
