import { KEY_DOC, useDoc } from '@/docs/doc-management';

import { useDocShareModalStore } from '../hooks/useDocShareModalStore';

import { DocShareModal } from './DocShareModal';

/**
 * 分享弹窗的挂载点 —— 必须渲染在**文档列表之上**(列表可能因查询失效而整体
 * 卸载,见 useDocShareModalStore 注释)。
 *
 * 弹窗内容(尤其链接设置 DocVisibility)直接读 `doc.link_reach` /
 * `doc.abilities`,所以不能只吃 store 里的冻结快照 —— 改完链接设置会显示
 * 旧值。这里用快照即时渲染(不闪),同时 useDoc 拉最新值覆盖:分享类
 * mutation 都会失效 KEY_DOC,故 doc 始终新鲜。
 */
export const DocShareModalHost = () => {
  const { doc: snapshot, page, close } = useDocShareModalStore();

  const { data: fresh } = useDoc(
    { id: snapshot?.id ?? '' },
    {
      queryKey: [KEY_DOC, { id: snapshot?.id ?? '' }],
      enabled: !!snapshot?.id,
      initialData: snapshot ?? undefined,
    },
  );

  const doc = fresh ?? snapshot;
  if (!doc) {
    return null;
  }

  return (
    <DocShareModal
      key={`${doc.id}-${page}`}
      doc={doc}
      initialPage={page}
      onClose={close}
    />
  );
};
