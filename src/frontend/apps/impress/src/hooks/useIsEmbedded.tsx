import { useEffect, useState } from 'react';

/**
 * P3 内嵌：meet 在导航框架内用 `?embed=1` iframe 打开 docs。此时把 docs 自带的
 * 用户菜单（退出 / 语言切换）收敛到 meet 框架，避免「双层壳」。
 *
 * 用 URL 参数判断而非 `window.self !== window.top`：由外层显式传入，更确定，
 * 也不受浏览器 iframe 策略影响。SSG 下初值 false、mount 后读，避免 hydration 失配。
 */
export const useIsEmbedded = (): boolean => {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmbedded(params.get('embed') === '1');
  }, []);
  return embedded;
};
