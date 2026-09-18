import { act, render } from '@testing-library/react';
import i18next from 'i18next';
import { describe, expect, it, vi } from 'vitest';

import { AppWrapper } from '@/tests/utils';

import { LeftPanelHeaderActions } from './LeftPanelHeader';

/**
 * 二级导航栏栏头的标题要跟着界面语言走 —— 中文下是「云文档」(与宿主一级 rail 上
 * 那个模块名同一个词),不是固定的 "Docs"。
 *
 * 这份用例故意用**真 i18n**(`AppWrapper` 里的 `@/i18n/initI18n`),因为要钉住的正是
 * 词条本身;`LeftPanelHeader.test.tsx` 那份把 `useTranslation` 换成了 `t: (s) => s`,
 * 只保证「标题走的是 t()」,看不到译文。
 */
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/', push: vi.fn() }),
}));
vi.mock('@/stores', () => ({
  useResponsiveStore: () => ({ isMobile: false, isTablet: false }),
}));
vi.mock('../stores', () => ({
  useLeftPanelStore: () => ({ closePanel: vi.fn(), togglePanel: vi.fn() }),
}));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ authenticated: true }),
}));
vi.mock('@/core', () => ({ useConfig: () => ({ data: undefined }) }));
vi.mock('@/docs/doc-management/components/NewDocButton', () => ({
  NewDocButton: () => <button data-testid="new-doc-button" />,
}));
vi.mock('@/docs/doc-search/components/DocSearchButtonModal', () => ({
  DocSearchButtonModal: () => <button data-testid="search-docs-button" />,
}));

describe('left panel header title language', () => {
  it('reads 云文档 in Chinese and Docs in English', async () => {
    await act(async () => {
      await i18next.changeLanguage('zh');
    });
    const zh = render(<LeftPanelHeaderActions withTitle />, {
      wrapper: AppWrapper,
    });
    expect(
      zh.container.querySelector('.wm-subnav-header__title'),
    ).toHaveTextContent('云文档');
    zh.unmount();

    await act(async () => {
      await i18next.changeLanguage('en');
    });
    const en = render(<LeftPanelHeaderActions withTitle />, {
      wrapper: AppWrapper,
    });
    expect(
      en.container.querySelector('.wm-subnav-header__title'),
    ).toHaveTextContent('Docs');

    await act(async () => {
      await i18next.changeLanguage('en');
    });
  });
});
