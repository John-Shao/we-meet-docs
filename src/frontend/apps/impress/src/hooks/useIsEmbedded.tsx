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
 * We Meet App 的 docs WebView 在 UA 末尾追加的标记（见 we-meet-android
 * `ui/docs/DocsScreen.kt` 的 EMBED_UA_MARKER，改动需两边同步）。
 */
const EMBED_UA_MARKER = 'WeMeetApp';

/**
 * docs 被 meet iframe 或 We Meet App 的 WebView 嵌入时,收敛掉 docs 自带的用户区
 * (退出/语言/头像),交给外层框架。任一判据成立即算嵌入:
 *  - `window.self !== window.top`：iframe 场景(web 端 meet 内嵌)最可靠;
 *  - UA 含 `WeMeetApp`：App 的 WebView —— 它是顶层加载,上面那条恒 false,而
 *    ?embed=1 又活不过 authenticate→returnTo→`/` 的重定向链,UA 是唯一挺得住的信号;
 *  - sessionStorage `docs-embed` / 当前 URL 的 ?embed=1：参数没被重定向丢掉时的兜底。
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
    const inApp = navigator.userAgent.includes(EMBED_UA_MARKER);
    let stored = false;
    try {
      stored = window.sessionStorage.getItem(EMBED_KEY) === '1';
    } catch {
      /* ignore */
    }
    const paramEmbed =
      new URLSearchParams(window.location.search).get('embed') === '1';
    setEmbedded(inIframe || inApp || stored || paramEmbed);
  }, []);
  return embedded;
};
