/** Early native clients wrote inline arrays instead of BlockNote documents. */
export function normalizeCommentBody(body: unknown): unknown {
  if (typeof body === 'string') {
    return [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: body, styles: {} }],
      },
    ];
  }
  if (
    Array.isArray(body) &&
    body.length &&
    body.every(
      (item: unknown) =>
        item &&
        typeof item === 'object' &&
        'type' in item &&
        ['text', 'link'].includes(String(item.type)),
    )
  ) {
    return [{ type: 'paragraph', content: body }];
  }
  return body;
}
