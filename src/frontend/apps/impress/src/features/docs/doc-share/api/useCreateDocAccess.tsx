import { useMutation, useQueryClient } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import {
  Access,
  Doc,
  KEY_DOC,
  KEY_LIST_DOC,
  Role,
} from '@/docs/doc-management';
import { User } from '@/features/auth';
import { useBroadcastStore } from '@/stores/useBroadcastStore';

import { OptionType } from '../types';

import { KEY_LIST_DOC_ACCESSES } from './useDocAccesses';
import { KEY_LIST_USER } from './useUsers';

interface CreateDocAccessParams {
  role: Role;
  docId: Doc['id'];
  memberId: User['id'];
}

export const createDocAccess = async ({
  memberId,
  role,
  docId,
}: CreateDocAccessParams): Promise<Access> => {
  const response = await fetchAPI(`documents/${docId}/accesses/`, {
    method: 'POST',
    body: JSON.stringify({
      user_id: memberId,
      role,
    }),
  });

  if (!response.ok) {
    throw new APIError(
      `Failed to add the member in the doc.`,
      await errorCauses(response, {
        type: OptionType.NEW_MEMBER,
      }),
    );
  }

  return response.json() as Promise<Access>;
};

export function useCreateDocAccess() {
  const queryClient = useQueryClient();
  const { broadcast } = useBroadcastStore();

  return useMutation<Access, APIError, CreateDocAccessParams>({
    mutationFn: createDocAccess,
    onSuccess: (_data, variable) => {
      // ⚠️ 这里必须是 invalidate 而非 reset:分享弹窗由文档列表行组件
      // (DocsGridActions)持有开关 state,而 resetQueries 会把列表缓存清空
      // → docs 为空 → DocsGrid 的 `hasDocs` 为 false → 整列表连同该行卸载
      // → 弹窗 state 丢失 → 用户刚加完人弹窗就自己关了。invalidate 保留
      // 现有数据、后台重取,不触发卸载(useUpdateDocAccess 一直是这么写的)。
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_DOC],
      });
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_USER],
      });
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_DOC_ACCESSES],
      });

      // Broadcast to every user connected to the document
      broadcast(`${KEY_DOC}-${variable.docId}`);
    },
  });
}
