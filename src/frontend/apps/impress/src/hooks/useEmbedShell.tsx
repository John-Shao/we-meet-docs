import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';

import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import { useRightPanelStore } from '@/features/right-panel/stores/useRightPanelStore';

import { useCmdK } from './useCmdK';
import { isWeMeetApp, sendToHost } from './useIsEmbedded';

/**
 * 被 we-meet 内嵌时的外壳协议层。
 *
 * ## 为什么要能力握手,而不是"检测到内嵌就收敛"
 *
 * 三端的发布速度差两个数量级:meet web 分钟级、docs 镜像小时级、App 周级。如果
 * docs 只凭"我被内嵌了"就把自带的搜索入口收掉,那么在还没发版的老 App 上,用户会
 * **既没有 docs 的搜索、也没有宿主的搜索** —— 一个谁都不负责的死角。
 *
 * 所以判据必须是**宿主宣告了什么能力**:宿主说自己有 `global-search`,docs 才收自己的。
 * 老宿主不发握手 → 什么都不收 → 行为与改动前一致,不需要三端同步发版。
 *
 * ## 安全边界
 *
 * host → docs 的消息**不得携带需要被信任的数据**。App 场景下 docs 是被顶层 WebView
 * 加载的,收到的 `e.origin` 恒等于 docs 自身,**无法校验来源**(这条在
 * `useDocAccessRefreshBridge` 已经确立)。因此这一侧只接受"刷新 / 切 UI 状态 / 导航到
 * 白名单路径"这类无特权指令,且 `path` 必须过 {@link safePath} —— 否则就是一个
 * open-redirect + 钓鱼面。
 *
 * 反向(docs → host)的消息由宿主自己校验 origin,见 we-meet `DocsFrame.tsx`。
 */

export type EmbedPlatform = 'web' | 'app';

const CHROME_KEY = 'docs-chrome';

/**
 * 内嵌壳收敛模式:`none` = 阅读态(隐左栏,用于 App 单文档查看器)、
 * `editor` = 编辑画布(隐站点 chrome,只留编辑器,用于 App 编辑画布)、
 * 其它/缺省 = `full`(不收敛,独立访问或云文档 tab 的完整页)。
 *
 * 进站时带 `?chrome=<mode>`,这里在**模块求值时**(早于任何客户端重定向)
 * 把它落进 sessionStorage,好活过 docs 自己的跳转链 —— 与 `?embed=1` 同款手法,
 * 那条的教训见 useIsEmbedded 顶部。
 */
const normalizeChrome = (raw: string | null): 'none' | 'editor' | null => {
  if (raw === 'none' || raw === 'editor') {
    return raw;
  }
  return null;
};

if (typeof window !== 'undefined') {
  try {
    const chrome = normalizeChrome(
      new URLSearchParams(window.location.search).get('chrome'),
    );
    if (chrome) {
      window.sessionStorage.setItem(CHROME_KEY, chrome);
    } else {
      // 显式传了别的值(App 的云文档 tab 进站带 `chrome=full`)就**清掉**标记。
      // 不能假设两个 WebView 实例的 sessionStorage 是隔离的:万一同进程共享,
      // 打开过一次文档查看器就会让常驻的云文档 tab 从此丢掉左栏开关。
      window.sessionStorage.removeItem(CHROME_KEY);
    }
  } catch {
    /* 隐私模式 / storage 被禁 —— 退回下面的实时判据 */
  }
}

/** 当前是否处于某项收敛壳(如 `editor` / `none`);未收敛返回 false。 */
const isChromeMode = (mode: 'none' | 'editor' | 'full'): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  // full 是"不收敛",任何带标记的收敛态都不算 full。
  if (mode === 'full') {
    return !isChromeMode('none') && !isChromeMode('editor');
  }
  try {
    if (window.sessionStorage.getItem(CHROME_KEY) === mode) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    return new URLSearchParams(window.location.search).get('chrome') === mode;
  } catch {
    return false;
  }
};

/** 协议版本。与 we-meet `DocsFrame.tsx` 的 `HOST_PROTOCOL` 对应。 */
const PROTOCOL = 1;

/** 消息名。三端共用同一套字面量,改动需同步 we-meet / we-meet-android。 */
const MSG = {
  embedHello: 'wemeet-embed-hello',
  hostHello: 'wemeet-host-hello',
  routeChanged: 'wemeet-route-changed',
  navigate: 'wemeet-navigate',
  openSearch: 'wemeet-open-search',
  panelState: 'wemeet-panel-state',
  uiCommand: 'wemeet-ui-command',
} as const;

/** docs 向宿主宣告的能力。 */
const DOCS_FEATURES = [
  'route-sync',
  'panel-state',
  'open-search',
  'ui-command',
] as const;

/** 宿主可能宣告的能力(docs 会消费的那些)。 */
export type HostFeature =
  | 'global-search'
  | 'shell-nav'
  | 'route-sync'
  | 'docs-sharing-v2'
  | 'docs-member-picker';

/**
 * 当前是被哪一端内嵌的;独立访问 docs 时返回 null。
 *
 * ⚠️ 判据比 `useIsEmbedded` **更严**:刻意不认 sessionStorage 里的 `docs-embed`。
 * 那条标记是持久的(见 useIsEmbedded 顶部的模块级写入),同一个标签页先被 meet
 * 内嵌过、之后手动打开 docs 独立页时会误判成"内嵌"。现在这个误判的后果只是少一块
 * 用户区;而本文件驱动的是**整套外壳收敛**(左栏 chrome、隐藏 logo、隐藏搜索入口),
 * 误判会让独立访问的 docs 少掉一批入口。宁可在极少数丢参场景下不收敛,也不能收敛错对象。
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

type HandshakeState = 'idle' | 'pending' | 'settled' | 'timeout';

interface EmbedShellState {
  platform: EmbedPlatform | null;
  handshake: HandshakeState;
  hostFeatures: string[];
  setPlatform: (platform: EmbedPlatform | null) => void;
  setHandshake: (handshake: HandshakeState) => void;
  setHostFeatures: (hostFeatures: string[]) => void;
}

const useEmbedShellStore = create<EmbedShellState>((set) => ({
  platform: null,
  handshake: 'idle',
  hostFeatures: [],
  setPlatform: (platform) => set({ platform }),
  setHandshake: (handshake) => set({ handshake }),
  setHostFeatures: (hostFeatures) =>
    set({ hostFeatures, handshake: 'settled' }),
}));

/** 内嵌形态;独立访问时为 null。组件里判断"要不要收敛"请用 {@link useHostFeature}。 */
export const useEmbedPlatform = (): EmbedPlatform | null =>
  useEmbedShellStore((s) => s.platform);

/**
 * 宿主是否提供了某项能力 —— 也就是 docs 该不该把对应的自带入口收掉。
 *
 * 握手**未落定时按「已收敛」返回 true**:闪烁方向是"无 → 有"(短暂缺一个按钮,
 * 老宿主上才会发生,且只发生一次),比反方向"有 → 无"(按钮先出现再被抽走)柔和得多。
 * 2s 还没等到握手就认定宿主不支持,恢复显示。
 */
export const useHostFeature = (feature: HostFeature): boolean => {
  const platform = useEmbedShellStore((s) => s.platform);
  const handshake = useEmbedShellStore((s) => s.handshake);
  const hostFeatures = useEmbedShellStore((s) => s.hostFeatures);

  if (!platform) {
    return false;
  }
  if (handshake === 'idle' || handshake === 'pending') {
    return feature !== 'docs-sharing-v2' && feature !== 'docs-member-picker';
  }
  if (handshake === 'timeout') {
    return false;
  }
  return hostFeatures.includes(feature);
};

/**
 * 请求宿主打开它的全局搜索面板。
 *
 * 收敛态下 docs 不再自己弹搜索框:web 端连按钮都不渲染(宿主的 rail 上有搜索框 +
 * Ctrl+K),App 端保留按钮但点击走这里 —— 手机没有 Ctrl+K,只留快捷键等于没有入口。
 */
export const requestHostSearch = (): void => {
  sendToHost({ type: MSG.openSearch, scope: 'docs' });
};

const DOC_PATH_RE =
  /^\/docs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/i;
const ROOT_PATH_RE = /^\/(?:\?target=[a-z_]+)?$/i;

/**
 * 宿主要求跳转的路径白名单。
 *
 * 只放行 docs 站内的文档深链与列表页。**不能**图省事直接 `router.push(data.path)` ——
 * App 场景无法校验消息来源(见文件头),放任意路径进来等于把 docs 变成一个可被驱动的
 * 跳板。返回 null 表示丢弃。
 */
const safePath = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || raw.length > 200) {
    return null;
  }
  return DOC_PATH_RE.test(raw) || ROOT_PATH_RE.test(raw) ? raw : null;
};

const docIdFromPath = (path: string): string | null => {
  const m =
    /\/docs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      path,
    );
  return m ? m[1] : null;
};

/**
 * 挂一次即可(现挂在 `ConfigProvider`),负责这一层的全部副作用:
 * 写 `<html data-wemeet-embed>`、能力握手、路由/面板状态上报、接收宿主指令、
 * 以及把 Ctrl+K 转发给宿主的全局搜索。
 */
export const useEmbedShell = (): void => {
  const router = useRouter();
  const platform = useEmbedShellStore((s) => s.platform);
  const setPlatform = useEmbedShellStore((s) => s.setPlatform);
  const setHandshake = useEmbedShellStore((s) => s.setHandshake);
  const setHostFeatures = useEmbedShellStore((s) => s.setHostFeatures);
  const hostHasGlobalSearch = useHostFeature('global-search');

  /**
   * 把内嵌形态写到 `<html data-wemeet-embed="web|app">`,供 `styles/we-meet.css`
   * 里的外壳收敛样式做选择器 scope —— 这样所有收敛都只作用于被 meet 内嵌的形态,
   * **独立访问 docs 的样子一字不改**。
   *
   * 用根属性而不是给组件加 class:收敛涉及的元素散在 docs 各处(左栏、浮动条、
   * 编辑器周边),逐个改组件既啰嗦又扩大与 upstream 的冲突面;而 docs 上游本来就在
   * 这些节点上留了稳定的 `--docs--*` class,配一个根属性就够写选择器了。
   *
   * SSG 下首帧没有这个属性,mount 后才写(与 useIsEmbedded 同款,避免 hydration 失配)。
   */
  useEffect(() => {
    const detected = embedPlatform();
    setPlatform(detected);
    const root = document.documentElement;
    if (detected) {
      root.dataset.wemeetEmbed = detected;
    } else {
      delete root.dataset.wemeetEmbed;
    }
    // 收敛壳只在被内嵌时成立 —— 独立访问带上 ?chrome=none/editor 不该让人失去
    // 左栏/站点 chrome(与 `?chrome=none` 原有判据一致,这里泛化到 `editor`)。
    const chromeMode = isChromeMode('editor')
      ? 'editor'
      : isChromeMode('none')
        ? 'none'
        : null;
    if (detected && chromeMode) {
      root.dataset.wemeetChrome = chromeMode;
    } else {
      delete root.dataset.wemeetChrome;
    }
  }, [setPlatform]);

  // 能力握手。重发是幂等的,只为规避「docs 先挂载、宿主监听器还没装上」的竞态。
  useEffect(() => {
    if (!platform) {
      return;
    }
    setHandshake('pending');
    let settled = false;

    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        type?: string;
        features?: unknown;
        protocolVersion?: number;
      } | null;
      if (data?.type !== MSG.hostHello || data.protocolVersion === 2) {
        return;
      }
      settled = true;
      setHostFeatures(
        Array.isArray(data.features)
          ? data.features.filter((f): f is string => typeof f === 'string')
          : [],
      );
    };
    window.addEventListener('message', onMessage);

    const hello = () =>
      sendToHost({
        type: MSG.embedHello,
        protocol: PROTOCOL,
        platform,
        features: [...DOCS_FEATURES],
      });
    hello();
    const retries = [300, 900].map((ms) =>
      window.setTimeout(() => {
        if (!settled) {
          hello();
        }
      }, ms),
    );
    // 兜底晚于最后一次重发,免得"先判超时、握手又落定"造成来回闪。
    const giveUp = window.setTimeout(() => {
      if (!settled) {
        setHandshake('timeout');
      }
    }, 2000);

    return () => {
      window.removeEventListener('message', onMessage);
      retries.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(giveUp);
    };
  }, [platform, setHandshake, setHostFeatures]);

  // 站内导航上报:宿主据此同步地址栏(web)/ tab 标题(App)。
  // 不做 debounce —— 宿主侧只是一次 replaceState,幂等且便宜,加了反而可能吞掉末次事件。
  useEffect(() => {
    if (!platform) {
      return;
    }
    const emit = (path: string) => {
      sendToHost({
        type: MSG.routeChanged,
        path,
        docId: docIdFromPath(path),
        title: document.title,
      });
    };
    emit(router.asPath);
    router.events.on('routeChangeComplete', emit);
    return () => router.events.off('routeChangeComplete', emit);
  }, [platform, router]);

  // 左右面板开合上报:App 的返回键要据此决定"先关抽屉还是先退历史"。
  const lastPanelState = useRef<string>('');
  useEffect(() => {
    if (!platform) {
      return;
    }
    const emit = () => {
      const payload = {
        leftPanelOpen: useLeftPanelStore.getState().isPanelOpen,
        rightPanelOpen: useRightPanelStore.getState().isPanelOpen,
      };
      // 两个 store 里还有 wasAutoClosed 之类与宿主无关的字段,去重免得白发消息。
      const key = JSON.stringify(payload);
      if (key === lastPanelState.current) {
        return;
      }
      lastPanelState.current = key;
      sendToHost({ type: MSG.panelState, ...payload });
    };
    emit();
    const unsubLeft = useLeftPanelStore.subscribe(emit);
    const unsubRight = useRightPanelStore.subscribe(emit);
    return () => {
      unsubLeft();
      unsubRight();
    };
  }, [platform]);

  // 接收宿主指令。注意这一侧**无法校验来源**(见文件头),所以只认白名单。
  useEffect(() => {
    if (!platform) {
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as {
        type?: string;
        path?: unknown;
        command?: unknown;
      } | null;
      if (data?.type === MSG.navigate) {
        const path = safePath(data.path);
        if (path) {
          void router.push(path);
        }
        return;
      }
      if (data?.type === MSG.uiCommand) {
        if (data.command === 'close-left-panel') {
          useLeftPanelStore.getState().closePanel();
        } else if (data.command === 'close-panels') {
          useLeftPanelStore.getState().closePanel();
          const hasDraft = [
            ...document.querySelectorAll(
              '.bn-comment-editor [contenteditable="true"]',
            ),
          ].some((element) => element.textContent?.trim());
          if (!hasDraft) {
            useRightPanelStore.getState().setActivePanel(null);
          }
        } else if (data.command === 'open-left-panel') {
          useLeftPanelStore.getState().openPanel();
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [platform, router]);

  /**
   * Ctrl/Cmd+K 转发给宿主的全局搜索。
   *
   * **不能省**:快捷键归谁,由焦点在哪决定。docs 自己的 `useCmdK` 挂在 iframe 内的
   * document 上,meet 的挂在外层 window —— 用户在文档里打字时按 Ctrl+K,事件只会到
   * iframe。收掉 `DocSearchButtonModal` 之后若不留这条转发,按 Ctrl+K 会**什么都不
   * 发生**,比收敛前更糟。所以它挂在这里,而不是挂在那个会被卸载的搜索组件上。
   */
  const forwardSearch = useCallback(() => {
    if (!hostHasGlobalSearch) {
      return;
    }
    // 与 DocSearchButtonModal 同款守卫:BlockNote 的格式工具条开着时 Cmd+K 归它
    // (插入链接),不能抢。
    if (document.getElementsByClassName('bn-formatting-toolbar').length > 0) {
      return;
    }
    requestHostSearch();
  }, [hostHasGlobalSearch]);
  useCmdK(forwardSearch);
};
