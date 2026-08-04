import { useEffect } from 'react';

import { isWeMeetApp } from './useIsEmbedded';

export type EmbedPlatform = 'web' | 'app';

/**
 * 当前是被哪一端内嵌的;独立访问 docs 时返回 null。
 *
 * ⚠️ 判据比 {@link useIsEmbedded} **更严**:刻意不认 sessionStorage 里的
 * `docs-embed`。那条标记是持久的(见 useIsEmbedded 顶部的模块级写入),同一个
 * 标签页先被 meet 内嵌过、之后手动打开 docs 独立页时会误判成"内嵌"。
 * 现在这个误判的后果只是少一块用户区;而本 hook 驱动的是**整套外壳收敛**
 * (左栏 chrome、隐藏 logo、隐藏搜索入口),误判会让独立访问的 docs 少掉一批入口。
 * 宁可在极少数丢参场景下不收敛,也不能收敛错对象。
 */
export const embedPlatform = (): EmbedPlatform | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  // App 的 WebView 是**顶层**加载,下面的 iframe 判据恒为 false,只能靠 UA。
  if (isWeMeetApp()) {
    return 'app';
  }
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      // 跨域保护:读 window.top 抛异常本身就说明在 iframe 里。
      return true;
    }
  })();
  if (inIframe) {
    return 'web';
  }
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      return 'web';
    }
  } catch {
    /* 参数解析失败:按未内嵌处理 */
  }
  return null;
};

/**
 * 把内嵌形态写到 `<html data-wemeet-embed="web|app">`,供 `styles/we-meet.css`
 * 里的外壳收敛样式做选择器 scope —— 这样所有收敛都只作用于被 meet 内嵌的形态,
 * **独立访问 docs 的样子一字不改**。
 *
 * 用 CSS 属性而不是给组件加 class:收敛涉及的元素散在 docs 各处(左栏、浮动条、
 * 编辑器周边),逐个改组件既啰嗦又扩大与 upstream 的冲突面;而 docs 上游本来就在
 * 这些节点上留了稳定的 `--docs--*` class,配一个根属性就够写选择器了。
 *
 * SSG 下首帧没有这个属性,mount 后才写(与 useIsEmbedded 同款,避免 hydration 失配)。
 */
export const useEmbedShell = (): void => {
  useEffect(() => {
    const platform = embedPlatform();
    const root = document.documentElement;
    if (platform) {
      root.dataset.wemeetEmbed = platform;
    } else {
      delete root.dataset.wemeetEmbed;
    }
  }, []);
};
