import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachNativeEditorBridge } from '../../nativeEditorBridge';
import {
  trackEditorComment,
  trackEditorTitle,
  trackEditorUpload,
} from '../../nativeSaveTasks';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/hooks/useIsEmbedded', () => ({ sendToHost: send }));

describe('native editor protocol v2', () => {
  let detach: () => void;
  const flush = vi.fn<() => Promise<void>>();
  const blocker = vi.fn<() => string | undefined>();
  let navigate: (url: string) => void;
  const message = (
    type: string,
    fields: Record<string, unknown> = {},
    origin = location.origin,
  ) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin,
        data: {
          type,
          docId: 'doc',
          editorInstanceId: 'page',
          protocolVersion: 2,
          requestId: 'request',
          ...fields,
        },
      }),
    );
  const saved = (success: boolean) =>
    expect.objectContaining({
      type: 'wemeet-save-result',
      docId: 'doc',
      editorInstanceId: 'page',
      requestId: 'request',
      success,
    });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    flush.mockResolvedValue();
    blocker.mockReturnValue(undefined);
    detach = attachNativeEditorBridge('doc', {
      flush,
      blocker,
      isOffline: () => false,
      watchNavigation: (guard) => {
        navigate = guard;
        return () => undefined;
      },
    });
  });
  afterEach(() => {
    detach();
    document.body.inert = false;
    vi.useRealTimers();
  });

  it('requires a same-window, same-origin handshake and the matching page', async () => {
    message('wemeet-save-now');
    message('wemeet-host-hello', {}, 'https://untrusted.example');
    expect(send).not.toHaveBeenCalled();
    message('wemeet-host-hello');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wemeet-editor-ready',
        protocolVersion: 2,
      }),
    );
    message('wemeet-save-now', { editorInstanceId: 'old' });
    await vi.advanceTimersByTimeAsync(10);
    expect(flush).not.toHaveBeenCalled();
  });
  it('waits for title and upload, then freezes input through the acknowledgement', async () => {
    let finish!: () => void;
    const upload = trackEditorUpload(
      'doc',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const title = trackEditorTitle('doc', () => Promise.resolve('saved title'));
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    expect(flush).not.toHaveBeenCalled();
    expect(document.body.inert).toBe(true);
    finish();
    await upload;
    await title;
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledWith(saved(true));
    expect(document.body.inert).toBe(true);
    message('wemeet-resume-editor');
    expect(document.body.inert).toBe(false);
  });
  it('does not acknowledge an unfinished comment or attachment', async () => {
    blocker.mockReturnValue('comment-draft');
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledWith(saved(false));
    expect(flush).not.toHaveBeenCalled();
    expect(document.body.inert).toBe(false);
  });
  it('times out without accepting late success and allows a new request', async () => {
    let finish!: () => void;
    flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(12_100);
    expect(send).toHaveBeenCalledWith(saved(false));
    finish();
    await vi.advanceTimersByTimeAsync(10);
    expect(send).not.toHaveBeenCalledWith(saved(true));
    message('wemeet-save-now', { requestId: 'retry' });
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'retry', success: true }),
    );
  });
  it('deduplicates a completed request', async () => {
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    message('wemeet-save-now');
    expect(flush).toHaveBeenCalledTimes(1);
  });
  it('hands Next document links to the host before their click handler runs', () => {
    message('wemeet-host-hello');
    const link = document.createElement('a');
    link.href = '/docs/other/';
    const navigate = vi.fn();
    link.addEventListener('click', navigate);
    document.body.append(link);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'wemeet-editor-navigate',
        docId: 'doc',
        editorInstanceId: 'page',
        url: link.href,
      }),
    );
    link.remove();
  });
  it('cancels programmatic navigation until the host completes saving', () => {
    expect(() => navigate('/docs/other/')).not.toThrow();
    message('wemeet-host-hello');
    expect(() => navigate('/docs/other/')).toThrow(
      'Native save confirmation required',
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wemeet-editor-navigate' }),
    );
    expect(() =>
      navigate(location.pathname + '?version=preview'),
    ).not.toThrow();
  });
  it('waits for a pending comment without repeating its POST', async () => {
    let finish!: () => void;
    const post = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const comment = trackEditorComment('doc', post);
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    expect(flush).not.toHaveBeenCalled();
    finish();
    await comment;
    await vi.advanceTimersByTimeAsync(10);
    expect(post).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(saved(true));
  });
  it('does not report success after unmount or reuse old tasks for another page', async () => {
    let finish!: () => void;
    flush.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    detach();
    finish();
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.inert).toBe(false);
    expect(send).not.toHaveBeenCalledWith(saved(true));
  });
  it('serializes titles so a slow older write cannot win', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const first = trackEditorTitle(
      'doc',
      () =>
        new Promise<void>((resolve) => {
          order.push('first');
          finish = resolve;
        }),
    );
    const second = trackEditorTitle('doc', () => {
      order.push('second');
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual(['first']);
    finish();
    await first;
    await second;
    expect(order).toEqual(['first', 'second']);
  });
  it('retries a failed idempotent title before confirming close', async () => {
    const title = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue('title');
    await expect(trackEditorTitle('doc', title)).rejects.toThrow('network');
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(10);
    expect(title).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(saved(true));
  });
  it('keeps a late title retry ahead of edits made after a close timeout', async () => {
    let finish!: () => void;
    const order: string[] = [];
    const oldTitle = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = () => {
              order.push('old');
              resolve();
            };
          }),
      );
    await expect(trackEditorTitle('doc', oldTitle)).rejects.toThrow();
    message('wemeet-host-hello');
    message('wemeet-save-now');
    await vi.advanceTimersByTimeAsync(12_100);
    const newer = trackEditorTitle('doc', () => {
      order.push('new');
      return Promise.resolve();
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual([]);
    finish();
    await newer;
    expect(order).toEqual(['old', 'new']);
    expect(send).not.toHaveBeenCalledWith(saved(true));
  });
});
