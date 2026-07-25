import {
  UseMutationOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';
import { KEY_DOC, KEY_LIST_DOC } from '@/docs/doc-management';
import { useBroadcastStore } from '@/stores/useBroadcastStore';

import { KEY_LIST_DOC_ACCESSES } from './useDocAccesses';
import { KEY_LIST_USER } from './useUsers';

interface DeleteDocAccessProps {
  docId: string;
  accessId: string;
}

export const deleteDocAccess = async ({
  docId,
  accessId,
}: DeleteDocAccessProps): Promise<void> => {
  const response = await fetchAPI(`documents/${docId}/accesses/${accessId}/`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new APIError(
      'Failed to delete the member',
      await errorCauses(response),
    );
  }
};

type UseDeleteDocAccessOptions = UseMutationOptions<
  void,
  APIError,
  DeleteDocAccessProps
>;

export const useDeleteDocAccess = (options?: UseDeleteDocAccessOptions) => {
  const queryClient = useQueryClient();
  const { broadcast } = useBroadcastStore();

  return useMutation<void, APIError, DeleteDocAccessProps>({
    mutationFn: deleteDocAccess,
    ...options,
    onSuccess: (data, variables, onMutateResult, context) => {
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_DOC_ACCESSES],
      });
      void queryClient.invalidateQueries({
        queryKey: [KEY_DOC],
      });

      // Broadcast to every user connected to the document
      broadcast(`${KEY_DOC}-${variables.docId}`);

      // ⚠️ 必须 invalidate 而非 reset —— 详见 useCreateDocAccess 同处注释:
      // reset 清空列表缓存会让持有分享弹窗 state 的列表行卸载,弹窗随之消失
      // (用户一移除访问权,弹窗就自己关了)。
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_DOC],
      });
      void queryClient.invalidateQueries({
        queryKey: [KEY_LIST_USER],
      });
      if (options?.onSuccess) {
        void options.onSuccess(data, variables, onMutateResult, context);
      }
    },
  });
};
