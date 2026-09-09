import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react';
import {
  TreeDataItem,
  TreeViewDataType,
  TreeViewNodeTypeEnum,
  useTree,
} from '@gouvfr-lasuite/ui-kit';
import { act, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';

import type { Doc } from '../doc-management/types';

import { docTreeNodeHasChildren, hasDocTreeChildren } from './utils';

const doc = (id: string, children: Doc[] = [], numchild = children.length) =>
  ({ id, children, numchild, childrenCount: numchild }) as Doc;

const wrapper = ({ children }: PropsWithChildren) => (
  <CunninghamProvider>{children}</CunninghamProvider>
);

describe('document tree icon state', () => {
  it('restores the document icon when the last nested child is deleted', () => {
    const { result } = renderHook(
      () => useTree<Doc>([doc('parent', [doc('first'), doc('last')])]),
      { wrapper },
    );
    const parent = () => result.current.nodes[0];

    expect(docTreeNodeHasChildren(parent())).toBe(true);
    act(() => result.current.deleteNode('first'));
    expect(docTreeNodeHasChildren(parent())).toBe(true);
    act(() => result.current.deleteNode('last'));

    // The API snapshot is intentionally stale after local tree mutations.
    expect((parent().value as Doc).numchild).toBe(2);
    expect(docTreeNodeHasChildren(parent())).toBe(false);

    act(() => result.current.addChild('parent', doc('new-child')));
    expect(docTreeNodeHasChildren(parent())).toBe(true);
  });

  it('updates the root icon as its last child is removed and added again', () => {
    const { result } = renderHook(() => useTree<Doc>([doc('child')]), {
      wrapper,
    });

    expect(hasDocTreeChildren(result.current.nodes)).toBe(true);
    act(() => result.current.deleteNode('child'));
    expect(hasDocTreeChildren(result.current.nodes)).toBe(false);
    act(() => result.current.addChild(null, doc('new-child')));
    expect(hasDocTreeChildren(result.current.nodes)).toBe(true);
  });

  it('keeps collapsed, unloaded documents with children as folders', () => {
    const { result } = renderHook(
      () => useTree<Doc>([doc('unloaded', [], 4)]),
      {
        wrapper,
      },
    );
    expect(docTreeNodeHasChildren(result.current.nodes[0])).toBe(true);
  });

  it('keeps the folder when only a pending page remains', () => {
    const viewMore: TreeDataItem<TreeViewDataType<Doc>> = {
      key: 'view-more-parent',
      value: {
        id: 'view-more-parent',
        nodeType: TreeViewNodeTypeEnum.VIEW_MORE,
        label: 'More',
      },
      children: null,
    };
    expect(hasDocTreeChildren([viewMore])).toBe(true);
    expect(
      docTreeNodeHasChildren({
        key: 'parent',
        value: { ...doc('parent'), hasLoadedChildren: true },
        children: [viewMore],
      }),
    ).toBe(true);
    expect(
      hasDocTreeChildren([
        {
          ...viewMore,
          value: {
            ...viewMore.value,
            nodeType: TreeViewNodeTypeEnum.SEPARATOR,
          },
        },
      ]),
    ).toBe(false);
  });
});
