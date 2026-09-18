import { CunninghamProvider } from '@gouvfr-lasuite/cunningham-react';
import { render, screen } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeftPanelStrip } from './LeftPanelStrip';

const state = vi.hoisted(() => ({
  isLargeScreen: true,
  isMobile: false,
  isTablet: false,
  isPanelOpen: false,
  openPanel: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock('@/stores/useResponsiveStore', () => ({
  useResponsiveStore: () => state,
}));
vi.mock('../stores', () => ({
  useLeftPanelStore: () => state,
}));

const wrapper = ({ children }: PropsWithChildren) => (
  <CunninghamProvider>{children}</CunninghamProvider>
);

describe('desktop left panel strip', () => {
  beforeEach(() => {
    Object.assign(state, {
      isLargeScreen: true,
      isMobile: false,
      isTablet: false,
      isPanelOpen: false,
    });
    state.openPanel.mockReset();
  });

  it('renders the strip with an expand button on desktop', () => {
    const { container } = render(<LeftPanelStrip />, { wrapper });
    expect(screen.getByTestId('left-panel-strip')).toBeVisible();
    expect(container.querySelector('.wm-subnav-strip')).not.toBeNull();
    expect(screen.getByTestId('left-panel-strip-expand')).toHaveAttribute(
      'aria-label',
      'Toggle left panel',
    );
  });

  it('re-opens the panel when the expand button is pressed', () => {
    render(<LeftPanelStrip />, { wrapper });
    screen.getByTestId('left-panel-strip-expand').click();
    expect(state.openPanel).toHaveBeenCalledTimes(1);
  });

  it('stays out of the narrow-screen layouts (drawer + floating bar own those)', () => {
    state.isLargeScreen = false;
    state.isMobile = true;
    const { container } = render(<LeftPanelStrip />, { wrapper });
    expect(container.querySelector('.wm-subnav-strip')).toBeNull();

    state.isMobile = false;
    state.isTablet = true;
    const tablet = render(<LeftPanelStrip />, { wrapper });
    expect(tablet.container.querySelector('.wm-subnav-strip')).toBeNull();
  });
});
