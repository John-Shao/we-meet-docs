import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ButtonHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Doc, LinkReach, LinkRole } from '@/docs/doc-management/types';

import { DocLinkSharePanel } from './DocLinkSharePanel';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  invalidate: vi.fn(),
  copy: vi.fn(),
  toast: vi.fn(),
  onCopied: vi.fn(),
}));
vi.mock('@gouvfr-lasuite/cunningham-react', () => ({
  VariantType: { SUCCESS: 'success' },
  useToastProvider: () => ({ toast: mocks.toast }),
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../api/useUpdateDocLink', () => ({ updateDocLink: mocks.update }));
vi.mock('@/docs/doc-management', async () => ({
  ...(await import('@/docs/doc-management/types')),
  KEY_DOC: 'doc',
  KEY_LIST_DOC: 'docs',
  getDocLinkReach: (doc: Doc) => doc.computed_link_reach ?? doc.link_reach,
  getDocLinkRole: (doc: Doc) => doc.computed_link_role ?? doc.link_role,
}));
const doc = {
  id: 'doc',
  link_reach: LinkReach.RESTRICTED,
  link_role: LinkRole.READER,
  abilities: {
    link_configuration: true,
    link_select_options: {
      restricted: null,
      authenticated: [LinkRole.READER, LinkRole.EDITOR],
      public: [LinkRole.READER, LinkRole.EDITOR],
    },
  },
} as unknown as Doc;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.copy.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue({
    link_reach: LinkReach.PUBLIC,
    link_role: LinkRole.EDITOR,
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mocks.copy },
    configurable: true,
  });
});
afterEach(cleanup);

describe('link sharing drafts', () => {
  it('does not offer a link role in restricted mode or write permissions when only copying', async () => {
    render(<DocLinkSharePanel doc={doc} />);
    expect(screen.queryByText('Link permission')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('saves the selected scope and role before copying', async () => {
    render(<DocLinkSharePanel doc={doc} onCopied={mocks.onCopied} />);
    fireEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ }),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Can edit' }));
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await waitFor(() => expect(mocks.onCopied).toHaveBeenCalledOnce());
    expect(mocks.toast).toHaveBeenCalledWith('Link Copied !', 'success', {
      duration: 3000,
    });
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
      id: 'doc',
      link_reach: 'public',
      link_role: 'editor',
    });
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.copy.mock.invocationCallOrder[0],
    );
  });
  it('does not copy after a save failure and retains the draft for retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('offline'));
    render(<DocLinkSharePanel doc={doc} onCopied={mocks.onCopied} />);
    fireEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await screen.findByRole('alert');
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(mocks.onCopied).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await waitFor(() => expect(mocks.onCopied).toHaveBeenCalledOnce());
  });
  it('omits the role when saving restricted access', async () => {
    render(
      <DocLinkSharePanel doc={{ ...doc, link_reach: LinkReach.PUBLIC }} />,
    );
    fireEvent.click(
      screen.getByRole('radio', { name: /Authorized users only/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
        id: 'doc',
        link_reach: 'restricted',
      }),
    );
  });
  it('offers manual copying without repeating a successful save', async () => {
    mocks.copy.mockRejectedValue(new Error('clipboard denied'));
    render(<DocLinkSharePanel doc={doc} onCopied={mocks.onCopied} />);
    fireEvent.click(
      screen.getByRole('radio', { name: /Anyone with the link/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await screen.findByRole('textbox', { name: 'Document link' });
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(2));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.onCopied).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it('lets viewers copy, without changing scope or granting permissions', async () => {
    render(
      <DocLinkSharePanel
        onCopied={mocks.onCopied}
        doc={{
          ...doc,
          abilities: { ...doc.abilities, link_configuration: false },
        }}
      />,
    );
    expect(
      screen.getByRole('radio', { name: /Anyone with the link/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(mocks.onCopied).toHaveBeenCalledOnce());
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('finishes copying and clears the busy guard before closing', async () => {
    let finishCopy!: () => void;
    mocks.copy.mockReturnValue(
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
    );
    let busy = false;
    const onCopied = vi.fn(() => expect(busy).toBe(false));
    render(
      <DocLinkSharePanel
        doc={doc}
        onBusyChange={(value) => {
          busy = value;
        }}
        onCopied={onCopied}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save and copy link' }));
    expect(busy).toBe(true);
    expect(onCopied).not.toHaveBeenCalled();
    finishCopy();
    await waitFor(() => expect(onCopied).toHaveBeenCalledOnce());
  });
});
