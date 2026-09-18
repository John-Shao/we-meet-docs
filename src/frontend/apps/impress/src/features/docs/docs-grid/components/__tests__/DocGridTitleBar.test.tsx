import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocDefaultFilter } from '@/docs/doc-management/types';
import { AppWrapper } from '@/tests/utils';

import { DocGridTitleBar } from '../DocsGrid';

/**
 * 内容标题栏右侧的「新建」只有**能落文档的两页**该有:所有文档 / 我的文档。
 * 与我分享那页装的是别人分享过来的文档,回收站里的文档只能恢复或彻底删除 ——
 * 这两页出现「新建」是个没有落点的入口(走查反馈)。
 */
const state = vi.hoisted<{
  authenticated: boolean;
  isDesktop: boolean;
  platform: string | null;
}>(() => ({ authenticated: true, isDesktop: true, platform: 'web' }));

vi.mock('@/features/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth')>()),
  useAuth: () => ({ authenticated: state.authenticated }),
}));

vi.mock('@/hooks/useEmbedShell', () => ({
  useEmbedPlatform: () => state.platform,
}));

vi.mock('@/stores', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores')>()),
  useResponsiveStore: () => ({
    isDesktop: state.isDesktop,
    isMobile: false,
    isTablet: false,
  }),
}));

vi.mock('@/docs/doc-management/components/NewDocButton', () => ({
  NewDocButton: () => <button data-testid="new-doc-button" />,
}));

const renderTitleBar = (target: DocDefaultFilter) =>
  render(<DocGridTitleBar target={target} />, { wrapper: AppWrapper });

describe('DocGridTitleBar', () => {
  beforeEach(() => {
    Object.assign(state, {
      authenticated: true,
      isDesktop: true,
      platform: 'web',
    });
  });

  it.each([
    [DocDefaultFilter.ALL_DOCS, 'All docs'],
    [DocDefaultFilter.MY_DOCS, 'My docs'],
  ])('renders 新建 on the creating pages (%s)', (target, title) => {
    const { container } = renderTitleBar(target);

    expect(container.querySelector('.wm-grid-titlebar')).not.toBeNull();
    expect(screen.getByText(title)).toBeVisible();
    expect(screen.getByTestId('new-doc-button')).toBeVisible();
  });

  it.each([
    [DocDefaultFilter.SHARED_WITH_ME, 'Shared with me'],
    [DocDefaultFilter.TRASHBIN, 'Trashbin'],
  ])('hides 新建 on the read-only pages (%s)', (target, title) => {
    renderTitleBar(target);

    expect(screen.getByText(title)).toBeVisible();
    expect(screen.queryByTestId('new-doc-button')).not.toBeInTheDocument();
  });

  it('hides 新建 when the docs app runs standalone (no host action slot)', () => {
    state.platform = null;
    renderTitleBar(DocDefaultFilter.ALL_DOCS);

    expect(screen.queryByTestId('new-doc-button')).not.toBeInTheDocument();
  });

  it('hides 新建 for anonymous visitors', () => {
    state.authenticated = false;
    renderTitleBar(DocDefaultFilter.ALL_DOCS);

    expect(screen.queryByTestId('new-doc-button')).not.toBeInTheDocument();
  });
});
