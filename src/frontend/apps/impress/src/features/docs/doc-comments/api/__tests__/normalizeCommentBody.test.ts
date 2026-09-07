import { describe, expect, it } from 'vitest';

import { normalizeCommentBody } from '../normalizeCommentBody';

describe('native comment compatibility', () => {
  it('wraps legacy inline arrays in a paragraph', () => {
    const inline = [{ type: 'text', text: 'hello', styles: {} }];
    expect(normalizeCommentBody(inline)).toEqual([
      { type: 'paragraph', content: inline },
    ]);
  });
  it('preserves Web blocks including links and formatting', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [{ type: 'link', href: '/docs/id', content: [] }],
      },
    ];
    expect(normalizeCommentBody(blocks)).toBe(blocks);
  });
});
