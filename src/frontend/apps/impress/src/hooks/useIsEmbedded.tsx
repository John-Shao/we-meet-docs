import { useEffect, useState } from 'react';

/**
 * P3 内嵌：docs 被 meet 的 iframe 嵌入时，收敛掉 docs 自带的用户菜单（退出 / 语言切换），
 * 交给外层 meet 框架，避免「双层壳」。
 *
 * 判定「在 iframe 里」主用 `window.self !== window.top` —— 比 `?embed=1` URL 参数可靠：
 * docs 根路由会 client 重定向 `/` → `/home/` 丢掉 query，参数活不过重定向；而 iframe
 * 嵌套关系不受重定向/导航影响。（同源仅比较引用，不触发跨域异常；真跨域访问 top 抛错也
 * 说明被嵌，catch 里按嵌入处理。）另外仍兜一层 `?embed=1`（首帧未重定向时也认）。
 *
 * SSG 下初值 false、mount 后判，避免 hydration 失配。
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
    const paramEmbed =
      new URLSearchParams(window.location.search).get('embed') === '1';
    setEmbedded(inIframe || paramEmbed);
  }, []);
  return embedded;
};
