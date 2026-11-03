import type { BlogRef } from './blog';

export type NodeType ='project' | 'axis' | 'idea' | 'evidence' | 'question';

export type NodeStatus = 'published' | 'draft' | 'deferred' | 'brainstorm' | 'rejected';

export type NodePriority = 'high' | 'medium' | 'low';

export type IdeaSource = 
  | 'rasheed_article' 
  | 'brainstorm_session' 
  | 'mostafa_outline' 
  | 'external_reference';

// 'reference': an idea from a finished, verified article — used for linking and
// inference, never written into the new article. 'draft': material to write.
export type IdeaRole = 'reference' | 'draft';

export type LinkType = 'supports' | 'contradicts' | 'extends' | 'prerequisite';

export interface IdeaLink {
  targetId: string;
  type: LinkType;
  notes?: string;
}

export interface IdeaNode {
  id: string;
  name: string;
  arabicLabel: string;
  type: NodeType;
  status: NodeStatus;
  priority: NodePriority;
  source: IdeaSource;
  sessionRef?: string;
  speakers: string[];
  targetArticle?: string;
  quranicVerses?: string;
  crossReferences: string[];
  blogRefs?: BlogRef[];
  linkedIdeas: IdeaLink[];
  notes: string;
  includeInDoc: boolean;
  // Optional so that ideas saved before this field read as 'draft' (see ideaRole)
  role?: IdeaRole;
  referenceArticleId?: string; // the reference article (useReferenceStore) it came from
  children?: IdeaNode[];
  collapsed?: boolean;
}

export interface ProjectSettings {
  title: string;
  subtitle?: string;
  author: string;
  date: string;
  description: string;
  fontSize: 'compact' | 'normal' | 'large';
  showQuranGoldenBox: boolean;
}

export interface ExtractedIdeaSuggestion {
  id: string;
  title: string;
  summary: string;
  speaker: string;
  suggestedParentId?: string;
  suggestedParentLabel?: string;
  quranicVerses?: string;
  type: NodeType;
  status: NodeStatus;
  accepted: boolean;
}

export function ideaRole(node: Pick<IdeaNode, 'role'>): IdeaRole {
  return node.role ?? 'draft';
}

// An accepted idea from a reference article, ready for the tree
export interface ReferenceIdeaInput {
  title: string;
  summary: string;
  verses: string[]; // "هود: 77-83"
  excerpt: string;
  // An existing axis, or else a new axis with this label
  parentId?: string;
  newAxisLabel?: string;
}
