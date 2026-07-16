import { useEffect, useState } from 'react';

const EMBED_KEY = 'docs-embed';

// 模块级捕获 ?embed=1：这段在首个客户端渲染前(bundle 求值时)就执行,早于 docs 的
// `/` → `/home/` 客户端重定向丢弃 query。写进 sessionStorage 让标记活过重定向 ——
// 尤其是 App 内 WebView:它是顶层加载(非 iframe),下面 window.self!==window.top 恒为
// false,只能靠这个被持久化的参数认出「被嵌入」。普通标签页(无 ?embed)永不置位。
if (typeof window !== 'undefined') {
  try {
    if (new URLSearchParams(window.location.search).get('embed') === '1') {
      window.sessionStorage.setItem(EMBED_KEY, '1');
    }
  } catch {
    /* 隐私模式 / storage 被禁 —— 退回下面的实时判据 */
  }
}

/**
 * docs 被 meet iframe 或 We Meet App 的 WebView 嵌入时,收敛掉 docs 自带的用户区
 * (退出/语言/头像),交给外层框架。判据三选一:
 *  - `window.self !== window.top`：iframe 场景(web 端 meet 内嵌)最可靠;
 *  - sessionStorage `docs-embed`：模块级在重定向前抓到的 ?embed=1(App 顶层 WebView 靠它);
 *  - 当前 URL 的 ?embed=1：首帧尚未重定向时的兜底。
 * SSG 下初值 false、mount 后判,避免 hydration 失配。
 */
export const useIsEmbedded = (): boolean => {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
    } catch {
      inIframe = true;
    }
    let stored = false;
    try {
      stored = window.sessionStorage.getItem(EMBED_KEY) === '1';
    } catch {
      /* ignore */
    }
    const paramEmbed =
      new URLSearchParams(window.location.search).get('embed') === '1';
    setEmbedded(inIframe || stored || paramEmbed);
  }, []);
  return embedded;
};
