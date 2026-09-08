import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { Doc, Role } from '@/docs/doc-management/types';
import type { User } from '@/features/auth/api/types';

import { DocShareAddMemberList } from './DocShareAddMemberList';

const mocks = vi.hoisted(() => ({ add: vi.fn(), toast: vi.fn() }));
vi.mock('@gouvfr-lasuite/cunningham-react', () => ({
  Button: ({
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string }) => (
    <button {...props} />
  ),
  VariantType: { ERROR: 'error' },
  useToastProvider: () => ({ toast: mocks.toast }),
}));
vi.mock('@/components', () => ({
  Box: ({ children }: PropsWithChildren) => <div>{children}</div>,
  Card: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock(
  '@/docs/doc-management',
  async () => await import('@/docs/doc-management/types'),
);
vi.mock('@/cunningham', () => ({
  useCunninghamTheme: () => ({ spacingsTokens: {} }),
}));
vi.mock('@/stores', () => ({
  useResponsiveStore: () => ({ isSmallMobile: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../api', () => ({
  useCreateDocAccess: () => ({ mutateAsync: mocks.add }),
}));
vi.mock('./DocRoleDropdown', () => ({
  DocRoleDropdown: ({ currentRole }: { currentRole: Role }) => (
    <span>{currentRole}</span>
  ),
}));
vi.mock('./DocShareAddMemberListItem', () => ({
  DocShareAddMemberListItem: ({ user }: { user: User }) => (
    <span>{user.full_name}</span>
  ),
}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('adds users with no email by ID, defaults to reader, and keeps only failures selected', async () => {
  const users = [
    { id: 'a', full_name: 'Alpha', email: null },
    { id: 'b', full_name: 'Beta', email: null },
  ] as unknown as User[];
  mocks.add
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('offline'));
  const afterInvite = vi.fn();
  render(
    <DocShareAddMemberList
      doc={{ id: 'doc', abilities: { accesses_manage: true } } as Doc}
      selectedUsers={users}
      afterInvite={afterInvite}
    />,
  );
  fireEvent.click(screen.getByTestId('doc-share-invite-button'));
  await waitFor(() =>
    expect(afterInvite).toHaveBeenCalledExactlyOnceWith([users[1]]),
  );
  expect(mocks.add).toHaveBeenNthCalledWith(1, {
    docId: 'doc',
    memberId: 'a',
    role: 'reader',
  });
  expect(mocks.add).toHaveBeenNthCalledWith(2, {
    docId: 'doc',
    memberId: 'b',
    role: 'reader',
  });
  expect(mocks.toast).toHaveBeenCalledTimes(1);
});

it('does not submit twice while a batch is pending', async () => {
  mocks.add.mockReturnValue(new Promise(() => {}));
  render(
    <DocShareAddMemberList
      doc={{ id: 'doc', abilities: { accesses_manage: true } } as Doc}
      selectedUsers={[{ id: 'a', full_name: 'Alpha' } as User]}
    />,
  );
  fireEvent.click(screen.getByTestId('doc-share-invite-button'));
  fireEvent.click(screen.getByTestId('doc-share-invite-button'));
  expect(mocks.add).toHaveBeenCalledTimes(1);
});
