import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react';
import { render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeftPanelHeaderActions } from './LeftPanelHeader';

/**
 * 内嵌(we-meet)时的二级导航栏栏头必须与宿主 `SubNavHeader` 同构:
 * 标题在左,模块图标动作在右,**收起按钮排最后**;模块主操作(新建)归内容标题栏,
 * 不再挂在栏头。独立访问 docs 时维持原来的「新建 + 主页/搜索」一行。
 */
const state = vi.hoisted(() => ({
  isMobile: false,
  isTablet: false,
  isLargeScreen: true,
  authenticated: true,
  pathname: '/',
  closePanel: vi.fn(),
  togglePanel: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: state.pathname, push: vi.fn() }),
}));
vi.mock('@/stores', () => ({ useResponsiveStore: () => state }));
vi.mock('../stores', () => ({ useLeftPanelStore: () => state }));
vi.mock('@/features/auth', () => ({ useAuth: () => state }));
vi.mock('@/core', () => ({ useConfig: () => ({ data: undefined }) }));
vi.mock('@/docs/doc-management/components/NewDocButton', () => ({
  NewDocButton: () => <button data-testid="new-doc-button" />,
}));
vi.mock('@/docs/doc-search/components/DocSearchButtonModal', () => ({
  DocSearchButtonModal: () => <button data-testid="search-docs-button" />,
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <CunninghamProvider>{children}</CunninghamProvider>
);

describe('left panel header actions', () => {
  beforeEach(() => {
    Object.assign(state, {
      isMobile: false,
      isTablet: false,
      isLargeScreen: true,
      authenticated: true,
      pathname: '/',
    });
    state.closePanel.mockReset();
  });

  it('embedded: title + icon actions + collapse button, no primary action', () => {
    const { container } = render(<LeftPanelHeaderActions withTitle />, {
      wrapper,
    });

    expect(container.querySelector('.wm-subnav-header')).not.toBeNull();
    expect(
      container.querySelector('.wm-subnav-header__actions'),
    ).not.toBeNull();
    expect(screen.getByText('Docs')).toBeVisible();
    expect(screen.getByTestId('left-panel-collapse')).toBeVisible();
    expect(screen.getByTestId('search-docs-button')).toBeVisible();
    // 新建搬到内容标题栏(宿主把模块主操作放在 TitleBar 右侧)。
    expect(screen.queryByTestId('new-doc-button')).not.toBeInTheDocument();
  });

  it('embedded: the collapse button closes the panel', () => {
    render(<LeftPanelHeaderActions withTitle />, { wrapper });
    screen.getByTestId('left-panel-collapse').click();
    expect(state.closePanel).toHaveBeenCalledTimes(1);
  });

  it('standalone: keeps the original 新建 + home/search row', () => {
    state.pathname = '/docs';
    render(<LeftPanelHeaderActions />, { wrapper });

    expect(screen.getByTestId('new-doc-button')).toBeVisible();
    expect(screen.getByTestId('home-button')).toBeVisible();
    expect(screen.queryByTestId('left-panel-collapse')).not.toBeInTheDocument();
  });
});
