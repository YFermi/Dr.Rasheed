import { IdeaNode, ProjectSettings } from '../types';

export const initialProjectSettings: ProjectSettings = {
  title: 'قصة لوط - بحث شامل ومقاربات تأصيلية',
  subtitle: 'تفكيك بنية الفاحشة، الإبصار، والسبيل في الخطاب القرآني',
  author: 'فريق البحث والدراسات القرآنية',
  date: 'رجب 1448 هـ / 2026 م',
  description: 'مشروع بحثي منهجي يستنطق دلالات المفردات القرآنية في سياق قصة لوط عليه السلام، مستخلص من جلسات العصف الذهني المشتركة.',
  fontSize: 'normal',
  showQuranGoldenBox: true,
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
