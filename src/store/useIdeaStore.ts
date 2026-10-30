import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  IdeaNode, 
  NodeType, 
  LinkType,
  IdeaLink, 
  ProjectSettings, 
  ExtractedIdeaSuggestion 
} from '../types';
import { initialProjectSettings, initialTreeData } from '../data/initialProject';

// Helpers
export function findNodeById(root: IdeaNode, id: string): IdeaNode | null {
  if (root.id === id) return root;
  if (!root.children) return null;
  for (const child of root.children) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

export function findParentNode(
  root: IdeaNode, 
  id: string
): { parent: IdeaNode; index: number } | null {
  if (!root.children) return null;
  for (let i = 0; i < root.children.length; i++) {
    if (root.children[i].id === id) {
      return { parent: root, index: i };
    }
    const found = findParentNode(root.children[i], id);
    if (found) return found;
  }
  return null;
}

export function getAllNodeList(root: IdeaNode, excludeId?: string): IdeaNode[] {
  const result: IdeaNode[] = [];
  function traverse(n: IdeaNode) {
    if (excludeId && n.id === excludeId) return;
    result.push(n);
    if (n.children) {
      n.children.forEach(traverse);
    }
  }
  traverse(root);
  return result;
}

export function deepCloneNode(node: IdeaNode, generateNewIds = false): IdeaNode {
  const id = generateNewIds ? `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : node.id;
  return {
    ...node,
    id,
    speakers: [...node.speakers],
    crossReferences: [...node.crossReferences],
    linkedIdeas: node.linkedIdeas.map(l => ({ ...l })),
    children: node.children ? node.children.map(c => deepCloneNode(c, generateNewIds)) : undefined,
  };
}

function updateNodeInTree(root: IdeaNode, id: string, updates: Partial<IdeaNode>): IdeaNode {
  if (root.id === id) {
    return { ...root, ...updates };
  }
  if (!root.children) return root;
  return {
    ...root,
    children: root.children.map(child => updateNodeInTree(child, id, updates)),
  };
}

function removeNodeFromTree(root: IdeaNode, id: string): IdeaNode {
  if (!root.children) return root;
  return {
    ...root,
    children: root.children
      .filter(child => child.id !== id)
      .map(child => removeNodeFromTree(child, id)),
  };
}

function collectAllIds(root: IdeaNode): string[] {
  const ids: string[] = [root.id];
  if (root.children) {
    root.children.forEach(c => ids.push(...collectAllIds(c)));
  }
  return ids;
}

interface IdeaStoreState {
  treeData: IdeaNode;
  selectedNodeId: string;
  projectSettings: ProjectSettings;
  expandedNodeIds: string[];
  clipboardNode: IdeaNode | null;
  isCut: boolean;
  highlightedLinkedNodeIds: string[];
  filterKeyword: string;
  wordPreviewZoom: number;
  // Briefly highlighted tree node (e.g. evidence just added from the blog reader)
  pulsingNodeId: string | null;

  // Link Navigator Specialized State
  linkingMode: { active: boolean; sourceId: string | null };
  activeLinkHighlight: { sourceId: string; targetId: string } | null;
  linkModalState: {
    isOpen: boolean;
    sourceId: string;
    targetId: string;
    initialType?: LinkType;
    initialNotes?: string;
    isEdit?: boolean;
  } | null;

  activeMiddleTab: 'links' | 'params' | 'verses' | 'stats' | 'blog';
  setActiveMiddleTab: (tab: 'links' | 'params' | 'verses' | 'stats' | 'blog') => void;

  // Actions
  selectNode: (id: string) => void;
  pulseNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<IdeaNode>) => void;
  toggleIncludeInDoc: (id: string) => void;
  toggleNodeExpand: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  addChildNode: (parentId: string, type?: NodeType) => string;
  addSiblingNode: (targetId: string, type?: NodeType) => string | null;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;
  moveNodeUp: (id: string) => void;
  moveNodeDown: (id: string) => void;
  cutNode: (id: string) => void;
  copyNode: (id: string) => void;
  pasteNode: (targetId: string) => void;
  reorderNode: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  addIdeaLink: (sourceId: string, link: IdeaLink) => void;
  updateIdeaLink: (sourceId: string, targetId: string, updates: Partial<IdeaLink>) => void;
  removeIdeaLink: (sourceId: string, targetId: string) => void;
  setHighlightedLinks: (ids: string[]) => void;
  setActiveLinkHighlight: (link: { sourceId: string; targetId: string } | null) => void;
  startLinkingMode: (sourceId?: string) => void;
  cancelLinkingMode: () => void;
  openLinkModal: (sourceId: string, targetId: string, initialType?: LinkType, initialNotes?: string, isEdit?: boolean) => void;
  closeLinkModal: () => void;
  setFilterKeyword: (kw: string) => void;
  setWordPreviewZoom: (zoom: number) => void;
  updateProjectSettings: (settings: Partial<ProjectSettings>) => void;
  importBatchIdeas: (suggestions: ExtractedIdeaSuggestion[]) => void;
  exportProjectJson: () => string;
  importProjectJson: (jsonStr: string) => boolean;
  resetToInitial: () => void;
}

export const useIdeaStore = create<IdeaStoreState>()(persist((set, get) => ({
  treeData: initialTreeData,
  selectedNodeId: 'axis-1',
  projectSettings: initialProjectSettings,
  expandedNodeIds: ['root-project', 'axis-1', 'axis-2', 'axis-3', 'axis-4', 'axis-5', 'idea-1-1'],
  clipboardNode: null,
  isCut: false,
  highlightedLinkedNodeIds: [],
  filterKeyword: '',
  wordPreviewZoom: 100,
  pulsingNodeId: null,
  linkingMode: { active: false, sourceId: null },
  activeLinkHighlight: null,
  linkModalState: null,
  activeMiddleTab: 'links',

  setActiveMiddleTab: (tab: 'links' | 'params' | 'verses' | 'stats' | 'blog') => set({ activeMiddleTab: tab }),

  selectNode: (id: string) => set({ selectedNodeId: id }),

  pulseNode: (id: string) => {
    set({ pulsingNodeId: id });
    setTimeout(() => {
      if (get().pulsingNodeId === id) set({ pulsingNodeId: null });
    }, 2000);
  },

  updateNode: (id: string, updates: Partial<IdeaNode>) => {
    set(state => ({
      treeData: updateNodeInTree(state.treeData, id, updates)
    }));
  },

  toggleIncludeInDoc: (id: string) => {
    const node = findNodeById(get().treeData, id);
    if (!node) return;
    const nextVal = !node.includeInDoc;

    // Helper to recursively toggle children as well
    function toggleRec(n: IdeaNode, val: boolean): IdeaNode {
      return {
        ...n,
        includeInDoc: val,
        children: n.children ? n.children.map(c => toggleRec(c, val)) : undefined
      };
    }

    set(state => {
      function apply(root: IdeaNode): IdeaNode {
        if (root.id === id) {
          return toggleRec(root, nextVal);
        }
        if (!root.children) return root;
        return {
          ...root,
          children: root.children.map(apply)
        };
      }
      return { treeData: apply(state.treeData) };
    });
  },

  toggleNodeExpand: (id: string) => {
    set(state => {
      const isExpanded = state.expandedNodeIds.includes(id);
      return {
        expandedNodeIds: isExpanded
          ? state.expandedNodeIds.filter(x => x !== id)
          : [...state.expandedNodeIds, id]
      };
    });
  },

  expandAll: () => {
    set(state => ({
      expandedNodeIds: collectAllIds(state.treeData)
    }));
  },

  collapseAll: () => {
    set({ expandedNodeIds: ['root-project'] });
  },

  addChildNode: (parentId: string, type?: NodeType) => {
    const state = get();
    const parent = findNodeById(state.treeData, parentId);
    if (!parent) return '';

    // Determine default node type based on parent
    let defaultType: NodeType = 'idea';
    if (parent.type === 'project') defaultType = 'axis';
    else if (parent.type === 'axis') defaultType = 'idea';
    else if (parent.type === 'idea') defaultType = 'evidence';
    else if (parent.type === 'evidence') defaultType = 'question';

    const nodeType = type || defaultType;
    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    
    let defaultLabel = 'فكرة فرعية جديدة';
    if (nodeType === 'axis') defaultLabel = 'محور جديد';
    else if (nodeType === 'evidence') defaultLabel = 'شاهد قرآني / دليل';
    else if (nodeType === 'question') defaultLabel = 'سؤال مفتوح جديد';

    const newNode: IdeaNode = {
      id: newId,
      name: `New ${nodeType}`,
      arabicLabel: defaultLabel,
      type: nodeType,
      status: 'draft',
      priority: 'medium',
      source: 'brainstorm_session',
      sessionRef: parent.sessionRef || 'EP195',
      speakers: [...parent.speakers],
      targetArticle: parent.targetArticle || '',
      quranicVerses: '',
      crossReferences: [],
      linkedIdeas: [],
      notes: '',
      includeInDoc: true,
      children: [],
    };

    function addRec(root: IdeaNode): IdeaNode {
      if (root.id === parentId) {
        return {
          ...root,
          children: [...(root.children || []), newNode]
        };
      }
      if (!root.children) return root;
      return {
        ...root,
        children: root.children.map(addRec)
      };
    }

    set({
      treeData: addRec(state.treeData),
      selectedNodeId: newId,
      expandedNodeIds: Array.from(new Set([...state.expandedNodeIds, parentId]))
    });

    return newId;
  },

  addSiblingNode: (targetId: string, type?: NodeType) => {
    const state = get();
    if (targetId === state.treeData.id) {
      // Cannot add sibling to root
      return null;
    }
    const parentInfo = findParentNode(state.treeData, targetId);
    if (!parentInfo) return null;

    const targetNode = findNodeById(state.treeData, targetId);
    const nodeType = type || (targetNode ? targetNode.type : 'idea');
    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let defaultLabel = 'عنصر جديد';
    if (nodeType === 'axis') defaultLabel = 'محور جديد';
    else if (nodeType === 'idea') defaultLabel = 'فكرة جديدة';
    else if (nodeType === 'evidence') defaultLabel = 'شاهد قرآني جديد';
    else if (nodeType === 'question') defaultLabel = 'سؤال جديد';

    const newNode: IdeaNode = {
      id: newId,
      name: `New ${nodeType}`,
      arabicLabel: defaultLabel,
      type: nodeType,
      status: 'draft',
      priority: 'medium',
      source: targetNode ? targetNode.source : 'brainstorm_session',
      sessionRef: targetNode?.sessionRef,
      speakers: targetNode ? [...targetNode.speakers] : [],
      targetArticle: targetNode?.targetArticle,
      quranicVerses: '',
      crossReferences: [],
      linkedIdeas: [],
      notes: '',
      includeInDoc: true,
      children: [],
    };

    function insertSibling(root: IdeaNode): IdeaNode {
      if (root.id === parentInfo!.parent.id) {
        const nextChildren = [...(root.children || [])];
        nextChildren.splice(parentInfo!.index + 1, 0, newNode);
        return {
          ...root,
          children: nextChildren
        };
      }
      if (!root.children) return root;
      return {
        ...root,
        children: root.children.map(insertSibling)
      };
    }

    set({
      treeData: insertSibling(state.treeData),
      selectedNodeId: newId,
    });

    return newId;
  },

  deleteNode: (id: string) => {
    const state = get();
    if (id === state.treeData.id) return; // Cannot delete root
    const parentInfo = findParentNode(state.treeData, id);
    const nextSelectedId = parentInfo ? parentInfo.parent.id : state.treeData.id;

    function cleanInboundLinks(node: IdeaNode): IdeaNode {
      const filtered = node.linkedIdeas.filter(l => l.targetId !== id);
      return {
        ...node,
        linkedIdeas: filtered,
        children: node.children ? node.children.map(cleanInboundLinks) : undefined,
      };
    }

    const treeWithoutNode = removeNodeFromTree(state.treeData, id);
    const cleanedTree = cleanInboundLinks(treeWithoutNode);

    set({
      treeData: cleanedTree,
      selectedNodeId: state.selectedNodeId === id ? nextSelectedId : state.selectedNodeId,
      activeLinkHighlight: null,
      highlightedLinkedNodeIds: state.highlightedLinkedNodeIds.filter(x => x !== id),
    });
  },

  duplicateNode: (id: string) => {
    const state = get();
    if (id === state.treeData.id) return;
    const parentInfo = findParentNode(state.treeData, id);
    if (!parentInfo) return;

    const sourceNode = findNodeById(state.treeData, id);
    if (!sourceNode) return;

    const cloned = deepCloneNode(sourceNode, true);
    cloned.arabicLabel = `${sourceNode.arabicLabel} (نسخة)`;

    function insertClone(root: IdeaNode): IdeaNode {
      if (root.id === parentInfo!.parent.id) {
        const nextChildren = [...(root.children || [])];
        nextChildren.splice(parentInfo!.index + 1, 0, cloned);
        return {
          ...root,
          children: nextChildren
        };
      }
      if (!root.children) return root;
      return {
        ...root,
        children: root.children.map(insertClone)
      };
    }

    set({
      treeData: insertClone(state.treeData),
      selectedNodeId: cloned.id
    });
  },

  moveNodeUp: (id: string) => {
    const state = get();
    const parentInfo = findParentNode(state.treeData, id);
    if (!parentInfo || parentInfo.index === 0) return;

    function swapUp(root: IdeaNode): IdeaNode {
      if (root.id === parentInfo!.parent.id) {
        const next = [...(root.children || [])];
        const idx = parentInfo!.index;
        const temp = next[idx];
        next[idx] = next[idx - 1];
        next[idx - 1] = temp;
        return { ...root, children: next };
      }
      if (!root.children) return root;
      return { ...root, children: root.children.map(swapUp) };
    }

    set({ treeData: swapUp(state.treeData) });
  },

  moveNodeDown: (id: string) => {
    const state = get();
    const parentInfo = findParentNode(state.treeData, id);
    if (!parentInfo) return;
    const parentChildren = parentInfo.parent.children || [];
    if (parentInfo.index >= parentChildren.length - 1) return;

    function swapDown(root: IdeaNode): IdeaNode {
      if (root.id === parentInfo!.parent.id) {
        const next = [...(root.children || [])];
        const idx = parentInfo!.index;
        const temp = next[idx];
        next[idx] = next[idx + 1];
        next[idx + 1] = temp;
        return { ...root, children: next };
      }
      if (!root.children) return root;
      return { ...root, children: root.children.map(swapDown) };
    }

    set({ treeData: swapDown(state.treeData) });
  },

  cutNode: (id: string) => {
    const state = get();
    if (id === state.treeData.id) return;
    const node = findNodeById(state.treeData, id);
    if (!node) return;
    set({ clipboardNode: deepCloneNode(node, false), isCut: true });
  },

  copyNode: (id: string) => {
    const state = get();
    const node = findNodeById(state.treeData, id);
    if (!node) return;
    set({ clipboardNode: deepCloneNode(node, false), isCut: false });
  },

  pasteNode: (targetId: string) => {
    const state = get();
    if (!state.clipboardNode) return;

    let targetNode = findNodeById(state.treeData, targetId);
    if (!targetNode) targetNode = state.treeData;

    const cloned = deepCloneNode(state.clipboardNode, true);

    let nextTree = state.treeData;
    if (state.isCut) {
      nextTree = removeNodeFromTree(nextTree, state.clipboardNode.id);
    }

    function insert(root: IdeaNode): IdeaNode {
      if (root.id === targetNode!.id) {
        return {
          ...root,
          children: [...(root.children || []), cloned]
        };
      }
      if (!root.children) return root;
      return {
        ...root,
        children: root.children.map(insert)
      };
    }

    set({
      treeData: insert(nextTree),
      selectedNodeId: cloned.id,
      clipboardNode: state.isCut ? null : state.clipboardNode,
      isCut: false,
      expandedNodeIds: Array.from(new Set([...state.expandedNodeIds, targetNode.id]))
    });
  },

  reorderNode: (sourceId: string, targetId: string, position: 'before' | 'after' | 'inside') => {
    const state = get();
    if (sourceId === targetId || sourceId === state.treeData.id) return;

    const sourceNode = findNodeById(state.treeData, sourceId);
    if (!sourceNode) return;

    // Check if target is a descendant of source
    const descendants = collectAllIds(sourceNode);
    if (descendants.includes(targetId)) return;

    // 1. Remove source
    const treeWithoutSource = removeNodeFromTree(state.treeData, sourceId);
    const clonedSource = deepCloneNode(sourceNode, false);

    // 2. Adjust type automatically if dragged to root or axis
    if (position === 'inside') {
      const target = findNodeById(treeWithoutSource, targetId);
      if (target?.type === 'project') clonedSource.type = 'axis';
      else if (target?.type === 'axis') clonedSource.type = 'idea';
    }

    // 3. Insert into target
    function insert(root: IdeaNode): IdeaNode {
      if (position === 'inside' && root.id === targetId) {
        return {
          ...root,
          children: [...(root.children || []), clonedSource]
        };
      }

      if (root.children) {
        const targetIndex = root.children.findIndex(c => c.id === targetId);
        if (targetIndex !== -1 && (position === 'before' || position === 'after')) {
          const next = [...root.children];
          const insertIdx = position === 'before' ? targetIndex : targetIndex + 1;
          next.splice(insertIdx, 0, clonedSource);
          return {
            ...root,
            children: next
          };
        }
        return {
          ...root,
          children: root.children.map(insert)
        };
      }
      return root;
    }

    set({
      treeData: insert(treeWithoutSource),
      selectedNodeId: sourceId
    });
  },

  addIdeaLink: (sourceId: string, link: IdeaLink) => {
    set(state => {
      const node = findNodeById(state.treeData, sourceId);
      if (!node) return {};
      // Filter out existing link to same target if exists
      const filtered = node.linkedIdeas.filter(l => l.targetId !== link.targetId);
      return {
        treeData: updateNodeInTree(state.treeData, sourceId, {
          linkedIdeas: [...filtered, link]
        })
      };
    });
  },

  removeIdeaLink: (sourceId: string, targetId: string) => {
    set(state => {
      const node = findNodeById(state.treeData, sourceId);
      if (!node) return {};
      return {
        treeData: updateNodeInTree(state.treeData, sourceId, {
          linkedIdeas: node.linkedIdeas.filter(l => l.targetId !== targetId)
        })
      };
    });
  },

  updateIdeaLink: (sourceId: string, targetId: string, updates: Partial<IdeaLink>) => {
    set(state => {
      const node = findNodeById(state.treeData, sourceId);
      if (!node) return {};
      const updatedLinks = node.linkedIdeas.map(l => 
        l.targetId === targetId ? { ...l, ...updates } : l
      );
      return {
        treeData: updateNodeInTree(state.treeData, sourceId, { linkedIdeas: updatedLinks })
      };
    });
  },

  setActiveLinkHighlight: (link: { sourceId: string; targetId: string } | null) => {
    set({
      activeLinkHighlight: link,
      highlightedLinkedNodeIds: link ? [link.sourceId, link.targetId] : [],
    });
  },

  startLinkingMode: (sourceId?: string) => {
    set({
      linkingMode: { active: true, sourceId: sourceId || null }
    });
  },

  cancelLinkingMode: () => {
    set({
      linkingMode: { active: false, sourceId: null }
    });
  },

  openLinkModal: (sourceId: string, targetId: string, initialType: LinkType = 'supports', initialNotes = '', isEdit = false) => {
    set({
      linkModalState: {
        isOpen: true,
        sourceId,
        targetId,
        initialType,
        initialNotes,
        isEdit,
      },
      linkingMode: { active: false, sourceId: null },
    });
  },

  closeLinkModal: () => {
    set({ linkModalState: null });
  },

  setHighlightedLinks: (ids: string[]) => set({ highlightedLinkedNodeIds: ids }),

  setFilterKeyword: (kw: string) => set({ filterKeyword: kw }),

  setWordPreviewZoom: (zoom: number) => set({ wordPreviewZoom: zoom }),

  updateProjectSettings: (settings: Partial<ProjectSettings>) => {
    set(state => ({
      projectSettings: { ...state.projectSettings, ...settings }
    }));
  },

  importBatchIdeas: (suggestions: ExtractedIdeaSuggestion[]) => {
    const accepted = suggestions.filter(s => s.accepted);
    if (accepted.length === 0) return;

    const state = get();
    let currentTree = state.treeData;

    for (const item of accepted) {
      const parentId = item.suggestedParentId || 'root-project';
      const targetParent = findNodeById(currentTree, parentId) || currentTree;

      const newNode: IdeaNode = {
        id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.title,
        arabicLabel: item.title,
        type: item.type || (targetParent.type === 'project' ? 'axis' : 'idea'),
        status: item.status || 'brainstorm',
        priority: 'high',
        source: 'brainstorm_session',
        sessionRef: 'مستورد من جلسة العصف',
        speakers: item.speaker ? [item.speaker] : ['فريق العصف'],
        targetArticle: '',
        quranicVerses: item.quranicVerses || '',
        crossReferences: [],
        linkedIdeas: [],
        notes: item.summary || '',
        includeInDoc: true,
        children: [],
      };

      function appendToParent(root: IdeaNode): IdeaNode {
        if (root.id === targetParent.id) {
          return {
            ...root,
            children: [...(root.children || []), newNode]
          };
        }
        if (!root.children) return root;
        return {
          ...root,
          children: root.children.map(appendToParent)
        };
      }

      currentTree = appendToParent(currentTree);
    }

    set({
      treeData: currentTree,
      expandedNodeIds: collectAllIds(currentTree)
    });
  },

  exportProjectJson: () => {
    const state = get();
    const data = {
      projectSettings: state.projectSettings,
      treeData: state.treeData,
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
    };
    return JSON.stringify(data, null, 2);
  },

  importProjectJson: (jsonStr: string) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.treeData && parsed.projectSettings) {
        set({
          treeData: parsed.treeData,
          projectSettings: parsed.projectSettings,
          selectedNodeId: parsed.treeData.id,
          expandedNodeIds: collectAllIds(parsed.treeData)
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to parse project JSON', e);
      return false;
    }
  },

  resetToInitial: () => {
    set({
      treeData: initialTreeData,
      projectSettings: initialProjectSettings,
      selectedNodeId: 'axis-1',
      expandedNodeIds: ['root-project', 'axis-1', 'axis-2', 'axis-3', 'axis-4', 'axis-5'],
      clipboardNode: null,
      isCut: false,
      highlightedLinkedNodeIds: [],
    });
  }
}), {
  name: 'idea-builder-project',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  // Only project data (links live inside treeData.linkedIdeas) plus tree
  // navigation; transient UI state such as modals and the clipboard is not saved.
  partialize: (state) => ({
    treeData: state.treeData,
    projectSettings: state.projectSettings,
    selectedNodeId: state.selectedNodeId,
    expandedNodeIds: state.expandedNodeIds,
  }),
}));
