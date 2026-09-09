import {
  TreeDataItem,
  TreeViewDataType,
  TreeViewNodeTypeEnum,
} from '@gouvfr-lasuite/ui-kit';

import type { Doc } from '../doc-management';

/**
 * Type guard to check if a tree node value is a Doc (as opposed to a
 * ui-kit synthetic node like VIEW_MORE, SEPARATOR, TITLE, or SIMPLE_NODE).
 */
export const isDocNode = (
  value: TreeViewDataType<Doc>,
): value is TreeViewDataType<Doc> & Doc => {
  return !value.nodeType || value.nodeType === TreeViewNodeTypeEnum.NODE;
};

/** Count actual documents and pending pages, not decorative tree nodes. */
export const hasDocTreeChildren = (
  nodes: TreeDataItem<TreeViewDataType<Doc>>[] | null,
) =>
  nodes?.some(
    ({ value }) =>
      isDocNode(value) || value.nodeType === TreeViewNodeTypeEnum.VIEW_MORE,
  ) ?? false;

export const docTreeNodeHasChildren = (
  node: TreeDataItem<TreeViewDataType<Doc>>,
) => {
  if (!isDocNode(node.value)) {
    return false;
  }
  if (hasDocTreeChildren(node.children)) {
    return true;
  }
  // Once loaded, the live children take precedence over the original API count.
  if (node.value.hasLoadedChildren) {
    return false;
  }
  return (node.value.childrenCount ?? node.value.numchild ?? 0) > 0;
};

export const subPageToTree = (children: Doc[]): TreeViewDataType<Doc>[] => {
  children.forEach((child) => {
    child.childrenCount = child.numchild ?? 0;
    subPageToTree(child.children ?? []);
  });
  return children;
};

export const findIndexInTree = (
  nodes: TreeDataItem<TreeViewDataType<Doc>>[],
  key: string,
) => {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].key === key) {
      return i;
    }
    if (nodes[i].children?.length ?? 0 > 0) {
      const childIndex: number = nodes[i].children
        ? findIndexInTree(nodes[i].children ?? [], key)
        : -1;

      if (childIndex !== -1) {
        return childIndex;
      }
    }
  }
  return -1;
};
