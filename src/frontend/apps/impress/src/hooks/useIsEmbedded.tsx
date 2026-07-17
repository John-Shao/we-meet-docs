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

const isWeMeetApp = () =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes(EMBED_UA_MARKER);

/**
 * 外层框架（meet web / We Meet App）当前的界面语言；拿不到时返回 null。
 *
 * 被内嵌时，框架的语言才是权威 —— 那是用户在 meet 的「我的 → 设置 → 语言」里选
 * 的。docs 默认让 `user.language`（自己 profile 里的旧值）压过一切（见
 * ConfigProvider），在内嵌场景下就成了 bug：App 明明是简体中文，docs 仍是英文。
 *
 * 取值优先级：
 *  - `?lang=`：web 端 meet 的 iframe 直接带着它加载 docs，最显式可靠；
 *  - App 的 WebView：`?lang=` 活不过 authenticate → returnTo → `/` 的重定向链，
 *    但 WebView 的 `navigator.language` 继承 app 的 Configuration，**就是**应用内
 *    语言（实测：设备 en-US、app 选简体中文时它是 `zh-CN`），且不会被 i18next 写回
 *    cookie 的缓存污染 —— 故用它；
 *  - 其余（web iframe 但参数丢失）：返回 null，保持 docs 自身偏好优先。此时
 *    navigator 是**浏览器**语言，未必等于 meet 的界面语言，拿它覆盖用户在 docs 里
 *    选过的语言会造成回归。
 */
export const embedderLanguage = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (fromQuery) {
    return fromQuery;
  }
  if (isWeMeetApp()) {
    return navigator.language || null;
  }
  return null;
};

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
    const inApp = isWeMeetApp();
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
