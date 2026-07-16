import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { fallbackLng } from './config';
import resources from './translations.json';

// Add an initialization guard
let isInitialized = false;

// Initialize i18next with the base translations only once
if (!isInitialized && !i18next.isInitialized) {
  // eslint-disable-next-line no-useless-assignment
  isInitialized = true;

  i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng,
      debug: false,
      detection: {
        // P3 内嵌：querystring 优先 —— meet 用 ?lang= 驱动 docs 语言（收敛到框架）。
        // 命中后缓存进 cookie；直连 docs（无 ?lang=）则回退 cookie/navigator。
        order: ['querystring', 'cookie', 'navigator'],
        lookupQuerystring: 'lang',
        caches: ['cookie'],
        lookupCookie: 'docs_language',
        cookieMinutes: 525600,
        cookieOptions: {
          path: '/',
          sameSite: 'lax',
        },
      },
      interpolation: {
        escapeValue: false,
      },
      lowerCaseLng: true,
      nsSeparator: false,
      keySeparator: false,
    })
    .then(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute(
          'lang',
          i18next.language || fallbackLng,
        );
        i18next.on('languageChanged', (lang) => {
          document.documentElement.setAttribute('lang', lang);
        });
      }
    })
    .catch((e) => console.error('i18n initialization failed:', e));
}

export default i18next;
