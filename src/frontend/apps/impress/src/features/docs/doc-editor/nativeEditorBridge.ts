import { sendToHost } from '@/hooks/useIsEmbedded';

import {
  activateEditorTasks,
  releaseEditorTasks,
  settleEditorTasks,
} from './nativeSaveTasks';

export interface NativeEditorDelegate {
  flush: () => Promise<void>;
  isOffline: () => boolean;
  blocker: () => string | undefined;
  watchNavigation?: (guard: (url: string) => void) => () => void;
}

/** One bridge instance per mounted document. Host challenges are scoped to each page load. */
export function attachNativeEditorBridge(
  docId: string,
  delegate: NativeEditorDelegate,
) {
  activateEditorTasks(docId);
  let instanceId: string | undefined;
  let activeRequest: string | undefined;
  let disposed = false;
  let generation = 0;
  let wasInert = false;
  const results = new Map<string, { success: boolean; reason?: string }>();
  const unlock = () => {
    if (activeRequest) {
      document.body.inert = wasInert;
    }
    activeRequest = undefined;
  };
  const report = (
    requestId: string,
    result: { success: boolean; reason?: string },
  ) =>
    sendToHost({
      type: 'wemeet-save-result',
      docId,
      editorInstanceId: instanceId,
      requestId,
      ...result,
    });

  const save = async (requestId: string) => {
    const run = ++generation;
    activeRequest = requestId;
    wasInert = document.body.inert;
    // Blur commits title and IME composition before blocking further user input.
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.inert = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (delegate.isOffline()) {
            throw new Error('offline');
          }
          await settleEditorTasks(docId);
          if (disposed || run !== generation) {
            throw new Error('cancelled');
          }
          // Let upload promises insert their block/reference before flushing Y.Doc.
          await new Promise((resolve) => setTimeout(resolve, 0));
          const blocker = delegate.blocker();
          if (blocker) {
            throw new Error(blocker);
          }
          await delegate.flush();
          if (delegate.isOffline()) {
            throw new Error('offline');
          }
          if (delegate.blocker()) {
            throw new Error('pending');
          }
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), 12_000);
        }),
      ]);
      if (disposed || run !== generation) {
        return;
      }
      const result = { success: true };
      results.set(requestId, result);
      report(requestId, result);
      // Stay inert until the native host destroys us or explicitly resumes editing.
    } catch (error) {
      if (disposed || run !== generation) {
        return;
      }
      generation++;
      const result = {
        success: false,
        reason: error instanceof Error ? error.message : 'save',
      };
      results.set(requestId, result);
      unlock();
      report(requestId, result);
    } finally {
      clearTimeout(timer);
      const oldest = results.keys().next().value;
      if (results.size > 32 && oldest) {
        results.delete(oldest);
      }
    }
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || event.origin !== window.location.origin) {
      return;
    }
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.docId !== docId) {
      return;
    }
    const id = data.editorInstanceId;
    if (typeof id !== 'string' || !id || id.length > 100) {
      return;
    }
    if (data.type === 'wemeet-host-hello' && data.protocolVersion === 2) {
      if (instanceId && instanceId !== id) {
        return;
      }
      instanceId = id;
      sendToHost({
        type: 'wemeet-editor-ready',
        docId,
        editorInstanceId: id,
        protocolVersion: 2,
        capabilities: {
          saveConfirmation: true,
          commentNavigation: true,
          versionPreview: true,
        },
      });
      return;
    }
    if (id !== instanceId) {
      return;
    }
    if (data.type === 'wemeet-resume-editor') {
      if (data.requestId === activeRequest) {
        generation++;
        results.clear();
        unlock();
      }
      return;
    }
    if (data.type !== 'wemeet-save-now') {
      return;
    }
    const requestId = data.requestId;
    if (typeof requestId !== 'string' || !requestId || requestId.length > 100) {
      return;
    }
    const cached = results.get(requestId);
    if (cached) {
      report(requestId, cached);
      return;
    }
    if (activeRequest) {
      return;
    }
    void save(requestId);
  };
  window.addEventListener('message', onMessage);
  // Next links navigate without WebView.shouldOverrideUrlLoading. Capture the
  // click before React so the host can save, then load the destination itself.
  const onClick = (event: MouseEvent) => {
    if (
      !instanceId ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (
      !(anchor instanceof HTMLAnchorElement) ||
      anchor.hasAttribute('download')
    ) {
      return;
    }
    const target = new URL(anchor.href, location.href);
    if (
      target.origin !== location.origin ||
      (target.pathname === location.pathname &&
        target.search === location.search)
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!activeRequest) {
      sendToHost({
        type: 'wemeet-editor-navigate',
        docId,
        editorInstanceId: instanceId,
        url: target.href,
      });
    }
  };
  document.addEventListener('click', onClick, true);
  const unwatchNavigation = delegate.watchNavigation?.((url) => {
    const target = new URL(url, location.href);
    if (
      !instanceId ||
      target.origin !== location.origin ||
      target.pathname === location.pathname
    ) {
      return;
    }
    if (!activeRequest) {
      sendToHost({
        type: 'wemeet-editor-navigate',
        docId,
        editorInstanceId: instanceId,
        url: target.href,
      });
    }
    // Next's beforeHistoryChange runs inside its cancellation boundary, before
    // history or the mounted page is changed. Programmatic tree navigation
    // therefore follows the same native save path as anchor clicks.
    throw Object.assign(new Error('Native save confirmation required'), {
      cancelled: true,
    });
  });
  return () => {
    disposed = true;
    generation++;
    unlock();
    window.removeEventListener('message', onMessage);
    document.removeEventListener('click', onClick, true);
    unwatchNavigation?.();
    releaseEditorTasks(docId);
  };
}
