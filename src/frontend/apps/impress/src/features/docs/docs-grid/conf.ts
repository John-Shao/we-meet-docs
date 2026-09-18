import { DocDefaultFilter } from '@/docs/doc-management/types';

export const PAGE_SIZE = 20;

/**
 * 「在这一页里新建 / 上传一篇文档」是否成立。
 *
 * 只在**能落文档的两页**成立:所有文档、我的文档。与我分享那一页装的是别人分享过来
 * 的文档,回收站里的文档只能恢复或彻底删除 —— 这两页给「新建」是个没有落点的入口。
 *
 * 同一套判断管着两处入口:内容标题栏右侧的「新建」按钮,以及拖拽导入的落点
 * (`DocsGrid` 的 `withUpload`),所以规则只写在这里一处,别在调用点各写一遍。
 */
export const canCreateDoc = (target?: DocDefaultFilter) =>
  !target ||
  target === DocDefaultFilter.ALL_DOCS ||
  target === DocDefaultFilter.MY_DOCS;
