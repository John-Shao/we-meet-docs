import { create } from 'zustand';

import { Doc } from '@/docs/doc-management';

interface DocShareModalStore {
  /** 打开中的文档快照;null = 弹窗关闭。 */
  doc: Doc | null;
  page: 'share' | 'members';
  open: (doc: Doc, page?: 'share' | 'members') => void;
  close: () => void;
}

/**
 * 分享弹窗的开关状态 —— 刻意放在列表行**之外**。
 *
 * 原本这个 state 由列表行组件(DocsGridActions)持有,于是任何让列表重挂的
 * 事件都会顺手把弹窗干掉:分享类 mutation 成功 → 列表查询失效/重置 → 列表
 * 卸载 → 行卸载 → state 丢失 → 用户刚加完人弹窗就自己关了。
 *
 * 把状态提到全局 store、由 DocShareModalHost 在列表**上层**渲染后,弹窗与
 * 列表的挂载生命周期彻底解耦 —— 将来换分页、加筛选、切视图导致列表重挂,
 * 也不会再把弹窗带走。
 */
export const useDocShareModalStore = create<DocShareModalStore>((set) => ({
  doc: null,
  page: 'share',
  open: (doc, page = 'share') => set({ doc, page }),
  close: () => set({ doc: null, page: 'share' }),
}));
