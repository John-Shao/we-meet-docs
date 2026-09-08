import {
  CunninghamProvider,
  Modal,
  ModalSize,
} from '@gouvfr-lasuite/cunningham-react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Doc } from '@/docs/doc-management/types';

import { ModalSelectVersion } from './ModalSelectVersion';

vi.mock('@/components', async () => ({
  ...(await import('@/components/Box')),
  ...(await import('@/components/Text')),
  ...(await import('@/components/modal/ModalHeader')),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('./DocVersionEditor', () => ({
  DocVersionEditor: ({ versionId }: { versionId: string }) => (
    <article aria-label="Version preview">{versionId}</article>
  ),
}));
vi.mock('./VersionList', () => ({
  VersionList: ({
    onSelectVersion,
  }: {
    onSelectVersion: (id: string) => void;
  }) => <button onClick={() => onSelectVersion('v2')}>Preview v2</button>,
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function Confirmation({
      onClose,
      onSuccess,
      versionId,
    }: {
      onClose: () => void;
      onSuccess: () => void;
      versionId: string;
    }) {
      return (
        <Modal
          isOpen
          size={ModalSize.SMALL}
          onClose={onClose}
          aria-label="Restore confirmation"
        >
          <span>{versionId}</span>
          <button onClick={onClose}>Cancel restore</button>
          <button onClick={onSuccess}>Confirm restore</button>
        </Modal>
      );
    },
}));

afterEach(cleanup);

function setup(canRestore = true, initialVersionId?: string) {
  const onClose = vi.fn();
  const doc = {
    id: 'doc',
    title: 'Meeting notes',
    abilities: { partial_update: canRestore },
  } as Doc;
  render(
    <CunninghamProvider>
      <ModalSelectVersion
        doc={doc}
        onClose={onClose}
        initialVersionId={initialVersionId}
      />
    </CunninghamProvider>,
  );
  return onClose;
}

describe('version history', () => {
  it('previews a selection and requires confirmation before restoring', () => {
    const onClose = setup();
    const restore = screen.getByRole('button', {
      name: 'Restore',
    });
    expect(restore).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview v2' }));
    expect(screen.getByRole('article')).toHaveTextContent('v2');
    expect(restore).toBeEnabled();
    expect(screen.queryByLabelText('Restore confirmation')).toBeNull();
    fireEvent.click(restore);
    expect(screen.getByLabelText('Restore confirmation')).toHaveTextContent(
      'v2',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel restore' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('article')).toHaveTextContent('v2');
    fireEvent.click(restore);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets a reader preview versions without offering restore', () => {
    setup(false);
    fireEvent.click(screen.getByRole('button', { name: 'Preview v2' }));
    expect(screen.getByRole('article')).toHaveTextContent('v2');
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('opens the requested version and closes from the shared title bar', () => {
    const onClose = setup(true, 'v1');
    expect(screen.getByRole('article')).toHaveTextContent('v1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Close the version history modal' }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
