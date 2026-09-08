import { Button, Modal, ModalSize } from '@gouvfr-lasuite/cunningham-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';
import { useDebouncedCallback } from 'use-debounce';

import { Box, Text } from '@/components';
import { QuickSearch, QuickSearchGroup } from '@/components/quick-search';
import { useConfig } from '@/core';
import { Doc } from '@/docs/doc-management';
import { User } from '@/features/auth';
import { useHostFeature } from '@/hooks/useEmbedShell';
import { sendToHost } from '@/hooks/useIsEmbedded';

import { useDocAccesses, useUsers } from '../api';
import { useDocAccessRefreshBridge } from '../hooks/useDocAccessRefreshBridge';

import { DocInheritedShareContent } from './DocInheritedShareContent';
import { DocModalHeader } from './DocModalHeader';
import { QuickSearchGroupAccessRequest } from './DocShareAccessRequest';
import { DocShareAddMemberList } from './DocShareAddMemberList';
import { QuickSearchGroupInvitation } from './DocShareInvitation';
import { QuickSearchGroupMember } from './DocShareMember';
import { SearchUserRow } from './SearchUserRow';

const MembersStyle = createGlobalStyle`
  .doc-members-layout { display: flex; flex-direction: column; max-height: 72dvh; min-height: 0; font-size: 14px; line-height: 1.5; }
  .doc-members-scroll { overflow-y: auto; min-height: 0; padding: 0 24px 16px; }
  .doc-members-layout [cmdk-list] { max-height: 48dvh; overflow-y: auto; }
  .doc-members-layout [cmdk-item] { min-height: 48px; cursor: auto; }
  .doc-members-layout [cmdk-input] { margin-bottom: 12px; }
  .doc-members-footer { padding: 16px 24px; display: flex; justify-content: flex-end; border-top: 1px solid var(--c--contextuals--border--surface--primary); }
`;

export function DocMembersModal({
  doc,
  onClose,
  isRootDoc = true,
}: {
  doc: Doc;
  onClose: () => void;
  isRootDoc?: boolean;
}) {
  const { t } = useTranslation();
  const hostPicker = useHostFeature('docs-member-picker');
  const { data: config } = useConfig();
  const minLength = config?.API_USERS_SEARCH_QUERY_MIN_LENGTH ?? 1;
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const close = () => {
    if (!busyRef.current) {
      onClose();
    }
  };
  const [selected, setSelected] = useState<User[]>([]);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const debounce = useDebouncedCallback(setQuery, 300);
  const members = useDocAccesses(
    { docId: doc.id },
    {
      queryKey: ['docs-accesses', { docId: doc.id }],
      refetchOnMount: 'always',
    },
  );
  const users = useUsers(
    { query, docId: doc.id },
    {
      queryKey: ['users', { query, docId: doc.id }],
      enabled: inviting && query.length >= minLength,
    },
  );
  useDocAccessRefreshBridge(doc.id);

  const canInvite = doc.abilities.accesses_manage && isRootDoc;
  const excluded = new Set([
    ...selected.map((user) => user.id),
    ...(members.data || []).map((access) => access.user?.id),
  ]);
  const results =
    input === query && !users.isFetching
      ? (users.data || []).filter((user) => !excluded.has(user.id))
      : [];
  const hint =
    query.length < minLength
      ? t('Type at least {{minLength}} characters to display user names', {
          minLength,
        })
      : users.isFetching || input !== query
        ? t('Loading...')
        : t('No matching users');
  return (
    <Modal
      isOpen
      onClose={close}
      closeOnClickOutside
      size={ModalSize.MEDIUM}
      hideCloseButton
      aria-label={t(inviting ? 'Invite members' : 'Members and permissions')}
      title={
        <DocModalHeader
          title={t(inviting ? 'Invite members' : 'Members and permissions')}
          documentTitle={doc.title}
          onClose={close}
          closeLabel={t('Close')}
        />
      }
    >
      <MembersStyle />
      <div className="doc-members-layout" data-testid="doc-members-modal">
        <div className="doc-members-scroll">
          {members.isPending ? (
            <p role="status">{t('Loading...')}</p>
          ) : members.isError ? (
            <>
              <p role="alert">{t('Could not load document members.')}</p>
              <Button onClick={() => void members.refetch()}>
                {t('Retry')}
              </Button>
            </>
          ) : (
            <>
              {inviting && selected.length > 0 && (
                <DocShareAddMemberList
                  doc={doc}
                  selectedUsers={selected}
                  onBusyChange={(value) => {
                    busyRef.current = value;
                    setBusy(value);
                  }}
                  onRemoveUser={(user) =>
                    setSelected((prev) =>
                      prev.filter((item) => item.id !== user.id),
                    )
                  }
                  afterInvite={(remaining) => {
                    setSelected(remaining);
                    void members.refetch();
                    if (!remaining.length) {
                      setInviting(false);
                    }
                  }}
                />
              )}
              <QuickSearch
                label={t('Search results')}
                inputValue={input}
                showInput={inviting}
                onFilter={(value) => {
                  setInput(value);
                  debounce(value);
                }}
                placeholder={t('Search by name')}
                loading={inviting && (users.isFetching || input !== query)}
              >
                {inviting ? (
                  <>
                    {users.isError ? (
                      <Box>
                        <Text role="alert">{t('Could not load users.')}</Text>
                        <Button onClick={() => void users.refetch()}>
                          {t('Retry')}
                        </Button>
                      </Box>
                    ) : (
                      <QuickSearchGroup
                        group={{
                          groupName: results.length ? t('Choose a user') : hint,
                          elements: results,
                          showWhenEmpty: true,
                        }}
                        onSelect={(user) => {
                          if (busyRef.current) {
                            return;
                          }
                          setSelected((prev) =>
                            prev.some((item) => item.id === user.id)
                              ? prev
                              : [...prev, user],
                          );
                        }}
                        renderElement={(user) => <SearchUserRow user={user} />}
                      />
                    )}
                  </>
                ) : isRootDoc ? (
                  <>
                    <QuickSearchGroupAccessRequest doc={doc} />
                    <QuickSearchGroupInvitation doc={doc} />
                    <QuickSearchGroupMember doc={doc} />
                  </>
                ) : (
                  <DocInheritedShareContent
                    rawAccesses={(members.data || []).filter(
                      (access) => access.document.id !== doc.id,
                    )}
                  />
                )}
              </QuickSearch>
              {inviting && (
                <p>
                  {t(
                    'Select users to grant access directly. No email or invitation acceptance is required.',
                  )}
                </p>
              )}
            </>
          )}
        </div>
        {canInvite && (
          <div className="doc-members-footer">
            <Button
              disabled={busy || members.isPending || members.isError}
              variant={inviting ? 'tertiary' : 'primary'}
              onClick={() => {
                if (hostPicker) {
                  sendToHost({
                    type: 'wemeet-invite-doc-members',
                    docId: doc.id,
                    title: doc.title,
                  });
                } else {
                  setInviting(!inviting);
                  setInput('');
                  setQuery('');
                  debounce.cancel();
                  setSelected([]);
                }
              }}
            >
              {t(inviting ? 'Back to members' : 'Invite members')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
