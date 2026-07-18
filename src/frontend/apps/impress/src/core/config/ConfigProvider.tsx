import { Loader } from '@gouvfr-lasuite/cunningham-react';
import Head from 'next/head';
import Script from 'next/script';
import { PropsWithChildren, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import { useCunninghamTheme } from '@/cunningham';
import { useAuthQuery } from '@/features/auth';
import {
  useCustomTranslations,
  useSynchronizedLanguage,
} from '@/features/language';
import {
  embedderLanguage,
  embedderTheme,
  useIsEmbedded,
} from '@/hooks/useIsEmbedded';
import { useAnalytics } from '@/libs';
import { useSentryStore } from '@/stores/useSentryStore';

import { useConfig } from './api/useConfig';

export const ConfigProvider = ({ children }: PropsWithChildren) => {
  const { data: conf } = useConfig();
  const { data: user } = useAuthQuery();
  const { setSentry } = useSentryStore();
  const { setTheme } = useCunninghamTheme();
  const { changeLanguageSynchronized } = useSynchronizedLanguage();
  const { customizeTranslations } = useCustomTranslations();
  const { AnalyticsProvider } = useAnalytics();
  const isEmbedded = useIsEmbedded();
  const { i18n } = useTranslation();
  const languageSynchronized = useRef(false);
  const favicon = conf?.theme_customization?.favicon;

  useEffect(() => {
    if (!user || languageSynchronized.current) {
      return;
    }

    // 被 meet(web iframe / We Meet App)内嵌时，外层框架的语言优先于 docs 自己
    // profile 里的 user.language —— 那是用户在 meet 的「设置 → 语言」里选的，理应
    // 说了算。否则 profile 的旧值（新用户默认 en-us）会把框架语言顶掉，表现为
    // 「App 是简体中文、docs 却始终英文，且改 App 语言也不动」。
    // changeLanguageSynchronized 会把它 PATCH 回 profile，所以只顶这一次，之后
    // profile 与框架自洽；独立访问 docs（非内嵌）行为不变。
    const frameLanguage = isEmbedded ? embedderLanguage() : null;
    const targetLanguage =
      frameLanguage ?? user?.language ?? i18n.resolvedLanguage ?? i18n.language;

    void changeLanguageSynchronized(targetLanguage, user).then(() => {
      languageSynchronized.current = true;
    });
  }, [
    user,
    isEmbedded,
    i18n.resolvedLanguage,
    i18n.language,
    changeLanguageSynchronized,
  ]);

  useEffect(() => {
    if (!conf?.theme_customization?.translations) {
      return;
    }

    customizeTranslations(conf.theme_customization.translations);
  }, [conf?.theme_customization?.translations, customizeTranslations]);

  useEffect(() => {
    if (!conf?.SENTRY_DSN) {
      return;
    }

    setSentry(conf.SENTRY_DSN, conf.ENVIRONMENT);
  }, [conf?.SENTRY_DSN, conf?.ENVIRONMENT, setSentry]);

  useEffect(() => {
    // 内嵌(meet web / We Meet App)时主题跟随外层端(见下方 effect),不套用后端
    // 全局 FRONTEND_THEME —— 否则用户在 meet 里选的深浅会被后端默认顶掉。
    if (isEmbedded || !conf?.FRONTEND_THEME) {
      return;
    }

    setTheme(conf.FRONTEND_THEME);
  }, [conf?.FRONTEND_THEME, setTheme, isEmbedded]);

  // 内嵌场景:主题跟随外层端(用户在 meet「我的 → 设置」选的深色/浅色)。
  //  - 首帧:embedderTheme() —— web iframe 的 ?theme= 或 App WebView 的 UA 标记;
  //  - 运行时:web iframe(同域)经 postMessage({type:'wemeet-theme'}) 实时同步,
  //    用户切换深浅时 docs 立即跟随、无需重载(App 端切换走重建 WebView + 新 UA)。
  useEffect(() => {
    if (!isEmbedded) {
      return;
    }

    const initial = embedderTheme();
    if (initial) {
      setTheme(initial);
    }

    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; theme?: string } | null;
      if (data?.type === 'wemeet-theme') {
        setTheme(data.theme === 'dark' ? 'dark' : 'default');
      }
    };
    window.addEventListener('message', onMessage);

    // 通知外层框架「docs 已就绪」,便于其补发一次当前主题(规避挂载竞态)。
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'wemeet-theme-ready' }, '*');
      }
    } catch {
      /* 跨域保护:非同域 parent 读取会抛,忽略 */
    }

    return () => window.removeEventListener('message', onMessage);
  }, [isEmbedded, setTheme]);

  useEffect(() => {
    if (!conf?.POSTHOG_KEY || !conf?.POSTHOG_HOST) {
      return;
    }

    const key = conf.POSTHOG_KEY;
    const host = conf.POSTHOG_HOST;
    void import('@/services').then(({ PostHogAnalytic }) => {
      new PostHogAnalytic({ key, host });
    });
  }, [conf?.POSTHOG_KEY, conf?.POSTHOG_HOST]);

  useEffect(() => {
    const frontendVersion = process.env.NEXT_PUBLIC_APP_VERSION;

    if (
      !conf?.RELEASE_VERSION ||
      !frontendVersion ||
      conf.RELEASE_VERSION === frontendVersion
    ) {
      return;
    }

    // Avoid infinite reload loops: only reload once per backend version
    const RELOAD_VERSION_KEY = 'reload-version';
    try {
      const reloadedForVersion = sessionStorage.getItem(RELOAD_VERSION_KEY);
      if (reloadedForVersion === conf.RELEASE_VERSION) {
        return;
      }

      sessionStorage.setItem(RELOAD_VERSION_KEY, conf.RELEASE_VERSION);
      window.location.reload();
    } catch {
      console.warn('Failed to access sessionStorage for version reload logic');
    }
  }, [conf?.RELEASE_VERSION]);

  if (!conf) {
    return (
      <Box $height="100vh" $width="100vw" $align="center" $justify="center">
        <Loader />
      </Box>
    );
  }

  return (
    <>
      {conf?.FRONTEND_CSS_URL && (
        <Head>
          <link rel="stylesheet" href={conf?.FRONTEND_CSS_URL} />
        </Head>
      )}
      {conf?.FRONTEND_JS_URL && (
        <Script src={conf?.FRONTEND_JS_URL} strategy="afterInteractive" />
      )}
      {favicon?.light.href && (
        <Head>
          <link
            rel="icon"
            media="(prefers-color-scheme: light)"
            {...favicon.light}
          />
        </Head>
      )}
      {favicon?.dark.href && (
        <Head>
          <link
            rel="icon"
            media="(prefers-color-scheme: dark)"
            {...favicon.dark}
          />
        </Head>
      )}
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <AnalyticsProvider>{children}</AnalyticsProvider>
    </>
  );
};
