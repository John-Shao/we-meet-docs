import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { useSaveDoc } from '../useSaveDoc';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  send: vi.fn(),
  callbacks: {} as { onSuccess: () => void; onError: () => void },
  events: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('next/router', () => ({ useRouter: () => ({ events: mocks.events }) }));
vi.mock('@/hooks/useIsEmbedded', () => ({
  isWeMeetApp: () => true,
  sendToHost: mocks.send,
}));
vi.mock('@/docs/doc-management/api/useDocContentUpdate', () => ({
  useDocContentUpdate: (callbacks: typeof mocks.callbacks) => {
    mocks.callbacks = callbacks;
    return { mutate: mocks.mutate };
  },
}));
vi.mock('@/docs/doc-management/stores/useProviderStore', () => ({
  useProviderStore: () => ({ isSynced: true }),
}));
vi.mock('@/features/service-worker', () => ({
  useIsOffline: () => ({ isOffline: false }),
}));
vi.mock('@/features/docs/doc-comments/api/DocsThreadStore', () => ({
  COMMENT_UPDATE_ORIGIN: 'commentMarkUpdate',
}));

describe('native save acknowledgement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const requestSave = () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'wemeet-save-now', docId: 'doc', requestId: 'request' },
      }),
    );
  const result = (success: boolean) => ({
    type: 'wemeet-save-result',
    docId: 'doc',
    requestId: 'request',
    success,
  });

  it('acknowledges only after persistence and includes edits made during the request', () => {
    const doc = new Y.Doc();
    const { unmount } = renderHook(() => useSaveDoc('doc', doc));
    act(() => {
      doc.getMap('text').set('a', 1);
      requestSave();
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalledWith(result(true));
    act(() => {
      doc.getMap('text').set('b', 2);
      mocks.callbacks.onSuccess();
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(mocks.send).not.toHaveBeenCalledWith(result(true));
    act(() => mocks.callbacks.onSuccess());
    expect(mocks.send).toHaveBeenCalledWith(result(true));
    unmount();
    doc.destroy();
  });

  it('keeps local changes dirty after a remote transaction and a failed save', () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const { unmount } = renderHook(() => useSaveDoc('doc', doc));
    act(() => {
      doc.getMap('text').set('local', 1);
      remote.getMap('text').set('remote', 2);
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), {
        constructor: { name: 'HocuspocusProvider' },
      });
      requestSave();
      mocks.callbacks.onError();
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(result(false));
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'wemeet-editor-dirty',
      docId: 'doc',
      dirty: true,
    });
    act(() => {
      requestSave();
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    unmount();
    doc.destroy();
    remote.destroy();
  });

  it('acknowledges a clean document without writing and ignores another document', () => {
    const doc = new Y.Doc();
    const { unmount } = renderHook(() => useSaveDoc('doc', doc));
    act(() => {
      requestSave();
    });
    expect(mocks.send).toHaveBeenCalledWith(result(true));
    expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.send.mockClear();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'wemeet-save-now',
            docId: 'other',
            requestId: 'request',
          },
        }),
      );
    });
    expect(mocks.send).not.toHaveBeenCalled();
    unmount();
    doc.destroy();
  });
});
