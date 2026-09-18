import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react';
import { render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderFloatingBar } from './HeaderFloatingBar';

type HeaderState = {
  isTablet: boolean;
  isMobile: boolean;
  isLargeScreen: boolean;
  isPanelOpen: boolean;
  platform: string | null;
  globalSearch: boolean;
  authenticated: boolean;
};

const state = vi.hoisted(
  (): HeaderState => ({
    isTablet: false,
    isMobile: false,
    isLargeScreen: false,
    isPanelOpen: false,
    platform: 'web',
    globalSearch: true,
    authenticated: true,
  }),
);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock('@/stores/useResponsiveStore', () => ({
  useResponsiveStore: () => state,
}));
vi.mock('@/features/left-panel/stores/useLeftPanelStore', () => ({
  useLeftPanelStore: () => state,
}));
vi.mock('@/features/left-panel/components/LeftPanelCollapseButton', () => ({
  LeftPanelCollapseButton: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel} />
  ),
}));
vi.mock('./HeaderIcon', () => ({ HeaderIcon: () => <span>Docs</span> }));
vi.mock('@/docs/doc-management', () => ({
  useDocStore: () => ({ currentDoc: undefined }),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => state }));
vi.mock('@/hooks/useCmdK', () => ({ useCmdK: vi.fn() }));
vi.mock('@/hooks/useEmbedShell', () => ({
  useEmbedPlatform: () => state.platform,
  useHostFeature: () => state.globalSearch,
  requestHostSearch: vi.fn(),
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <CunninghamProvider>{children}</CunninghamProvider>
);

describe('document list header', () => {
  beforeEach(() => {
    Object.assign(state, {
      isTablet: false,
      isMobile: false,
      isLargeScreen: false,
      isPanelOpen: false,
      platform: 'web',
      globalSearch: true,
      authenticated: true,
    });
  });

  it('leaves the large embedded screen a single left-panel toggle', () => {
    // 769–1023 那档 isLargeScreen 与 isTablet 同时为真:左栏入口归二级导航栏栏头 +
    // 36px 窄条,浮动条不能再放一颗,否则同屏出现两个「导航栏」按钮。
    state.isTablet = true;
    state.isLargeScreen = true;
    state.platform = 'web';
    const { rerender } = render(<HeaderFloatingBar />, { wrapper });
    expect(
      screen.queryByRole('button', { name: 'Toggle left panel' }),
    ).not.toBeInTheDocument();

    // 未内嵌(独立访问 docs)时保持原样。
    state.platform = null;
    rerender(<HeaderFloatingBar />);
    expect(
      screen.getByRole('button', { name: 'Toggle left panel' }),
    ).toBeVisible();
  });

  it('removes the empty desktop header and retains narrow-screen navigation without blur', () => {
    const { container, rerender } = render(<HeaderFloatingBar />, { wrapper });
    expect(screen.queryByTestId('floating-bar')).not.toBeInTheDocument();

    state.isTablet = true;
    rerender(<HeaderFloatingBar />);
    expect(
      screen.getByRole('button', { name: 'Toggle left panel' }),
    ).toBeVisible();
    expect(screen.getByTestId('floating-bar')).toHaveAttribute(
      'data-backdrop',
      'false',
    );
    expect(screen.queryByTestId('search-docs-button')).not.toBeInTheDocument();
    expect(container.querySelector('.--docs--card-floating-bar')).toBeNull();

    state.isTablet = false;
    rerender(<HeaderFloatingBar />);
    expect(screen.queryByTestId('floating-bar')).not.toBeInTheDocument();
  });

  it('removes the search card as soon as the web host takes over search', () => {
    state.isTablet = true;
    state.globalSearch = false;
    const { container, rerender } = render(<HeaderFloatingBar />, { wrapper });
    expect(
      screen
        .getByTestId('search-docs-button')
        .closest('.--docs--card-floating-bar'),
    ).not.toBeNull();

    state.globalSearch = true;
    rerender(<HeaderFloatingBar />);
    expect(container.querySelector('.--docs--card-floating-bar')).toBeNull();
  });

  it('retains the App search entry and removes the card when search is unavailable', () => {
    state.isTablet = true;
    state.isMobile = true;
    state.platform = 'app';
    const { container, rerender } = render(<HeaderFloatingBar />, { wrapper });
    expect(screen.getByTestId('search-docs-button')).toBeVisible();

    state.authenticated = false;
    rerender(<HeaderFloatingBar />);
    expect(screen.queryByTestId('search-docs-button')).not.toBeInTheDocument();
    expect(container.querySelector('.--docs--card-floating-bar')).toBeNull();
  });
});
