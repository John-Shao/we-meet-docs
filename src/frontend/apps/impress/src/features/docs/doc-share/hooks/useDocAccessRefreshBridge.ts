import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { KEY_DOC } from '@/docs/doc-management';

import {
  KEY_LIST_DOC_ACCESSES,
  KEY_LIST_DOC_ACCESS_REQUESTS,
  KEY_LIST_DOC_INVITATIONS,
} from '../api';

/**
 * 「分享到聊天」把授权改到了 docs 之外 —— 宿主端(meet web 的 /docs iframe、
 * App 的 Docs WebView)拿到目标会话后直接调 meet 后端给成员授只读,docs 这边
 * 一无所知,于是分享弹窗上的「与 N 位用户分享」停在旧值,要关掉重开才更新。
 *
 * 宿主授权成功后回发 `wemeet-doc-access-updated`,这里失效相关查询。App 端走
 * `evaluateJavascript` 注入 `window.postMessage(...)`,落到同一个监听上,双端
 * 共用一条通道(与 `wemeet-theme` 同一套路)。
 *
 * 不校验 e.origin:App 注入的消息 origin 就是 docs 自己,与 web iframe 的宿主
 * origin 对不齐,校验反而会把 App 端挡掉;而这条消息的全部作用只是「重新拉一
 * 次自己的数据」,伪造它既拿不到额外数据也改不了任何状态。
 */
export const useDocAccessRefreshBridge = (docId: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; docId?: string } | null;
      if (data?.type !== 'wemeet-doc-access-updated') {
        return;
      }
      // 宿主没带 docId(旧版本)时一律刷新;带了就只认当前这篇。
      if (data.docId && data.docId !== docId) {
        return;
      }
      [
        KEY_LIST_DOC_ACCESSES,
        KEY_LIST_DOC_ACCESS_REQUESTS,
        KEY_LIST_DOC_INVITATIONS,
        KEY_DOC,
      ].forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: [key] });
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [docId, queryClient]);
};
