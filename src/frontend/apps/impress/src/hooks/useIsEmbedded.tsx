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
export const EMBED_UA_MARKER = 'WeMeetApp';

export const isWeMeetApp = () =>
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
 * 外层框架（meet web / We Meet App）当前的深浅主题；拿不到时返回 null。
 *
 * 被内嵌时,docs 主题应跟随外层端(用户在 meet「我的 → 设置」里选的深色/浅色),
 * 而非后端全局 `FRONTEND_THEME`。返回的是 Cunningham 主题名:'dark' 或 'default'(亮)。
 *
 * 取值优先级(与 {@link embedderLanguage} 同构):
 *  - `?theme=`：web 端 meet 的 iframe 直接带着它加载 docs,最显式;运行时切换另走
 *    postMessage(见 ConfigProvider),此处只作首帧兜底;
 *  - App 的 WebView：`?theme=` 活不过 authenticate→returnTo→`/` 的重定向链,故 App
 *    把主题编进 UA(`theme=dark|light`,见 we-meet-android DocsScreen),从 UA 解析;
 *  - 其余:返回 null,保持 docs 自身(后端 FRONTEND_THEME)行为。
 */
export const embedderTheme = (): 'dark' | 'default' | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const fromQuery = new URLSearchParams(window.location.search).get('theme');
  if (fromQuery === 'dark') {
    return 'dark';
  }
  if (fromQuery === 'light' || fromQuery === 'default') {
    return 'default';
  }
  if (isWeMeetApp()) {
    const m = /theme=(dark|light)/.exec(navigator.userAgent);
    if (m) {
      return m[1] === 'dark' ? 'dark' : 'default';
    }
  }
  return null;
};

/**
 * We Meet App 的 docs WebView 注入的原生桥（见 we-meet-android `ui/docs/DocsScreen.kt`
 * 的 `WeMeetHost` JS interface，改动需两边同步）。web iframe 场景没有这个对象。
 */
interface WeMeetHostBridge {
  postEvent: (json: string) => void;
}

/**
 * 分享云文档到聊天（入口 B：文档列表「...」菜单 / 分享弹窗的「分享到聊天」）把
 * 事件送回宿主 —— web 端是 meet 的 iframe parent，App 端是 [WeMeetHostBridge]。
 * 两者之一都不存在（独立部署 / 普通标签页）时静默不做事：这是宿主提供的增强
 * 入口，不是 docs 自身功能的一部分。
 */
export const sendToHost = (payload: Record<string, unknown>): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const bridge = (window as unknown as { WeMeetHost?: WeMeetHostBridge })
    .WeMeetHost;
  if (bridge) {
    try {
      bridge.postEvent(JSON.stringify(payload));
    } catch {
      /* ignore: malformed payload / bridge threw */
    }
    return;
  }
  try {
    if (window.parent && window.parent !== window) {
      // 与 wemeet-theme-ready（见 ConfigProvider）同一约定：docs 从 iframe 内不知道
      // 宿主的精确 origin，且 meet/docs/id 同注册域部署，故用 '*'；宿主侧收到后自行
      // 校验 e.origin 再处理（发消息到聊天是比主题同步更高风险的动作）。
      window.parent.postMessage(payload, '*');
    }
  } catch {
    /* 跨域保护:非同域 parent 读取会抛,忽略 */
  }
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
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();
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
