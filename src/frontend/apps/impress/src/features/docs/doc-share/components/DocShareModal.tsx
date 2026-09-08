import { Button, Modal, ModalSize } from '@gouvfr-lasuite/cunningham-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';

import { Box, ButtonCloseModal, Text } from '@/components';
import { Doc, useDoc } from '@/docs/doc-management';
import { useEmbedPlatform, useHostFeature } from '@/hooks/useEmbedShell';
import { sendToHost } from '@/hooks/useIsEmbedded';

import { useDocAccessRefreshBridge } from '../hooks/useDocAccessRefreshBridge';

import { DocLinkSharePanel } from './DocLinkSharePanel';
import { DocMembersModal } from './DocMembersModal';

const ShareStyle = createGlobalStyle`
  .doc-sharing-layout { display: flex; flex-direction: column; min-height: 0; max-height: min(72dvh, 640px); font-size: 14px; line-height: 1.5; }
  .doc-sharing-tabs { display: flex; gap: 8px; padding: 12px 24px; border-bottom: 1px solid var(--c--contextuals--border--surface--primary); }
  .doc-sharing-scroll { overflow-y: auto; min-height: 0; padding: 16px 24px; }
  .doc-sharing-footer { display: flex; flex-shrink: 0; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--c--contextuals--border--surface--primary); }
  .doc-sharing-options { padding: 0; border: 0; margin: 0 0 24px; }
  .doc-sharing-options legend { font-weight: 600; margin-bottom: 12px; }
  .doc-sharing-option { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; cursor: pointer; }
  .doc-sharing-option input { margin-top: 4px; accent-color: var(--c--contextuals--content--semantic--brand--primary); }
  .doc-sharing-option small { display: block; margin-top: 4px; color: var(--c--contextuals--content--semantic--neutral--secondary); line-height: 1.5; }
  .doc-sharing-hint { color: var(--c--contextuals--content--semantic--neutral--secondary); line-height: 1.5; }
  .doc-sharing-url { box-sizing: border-box; width: 100%; padding: 12px; color: inherit; background: transparent; border: 1px solid var(--c--contextuals--border--surface--primary); border-radius: 8px; }
`;

export function DocShareModal({
  doc: snapshot,
  onClose,
  isRootDoc = true,
  initialPage = 'share',
}: {
  doc: Doc;
  onClose: () => void;
  isRootDoc?: boolean;
  initialPage?: 'share' | 'members';
}) {
  const { t } = useTranslation();
  const canChat = useHostFeature('docs-sharing-v2');
  const hasLegacyHost = useHostFeature('route-sync');
  const platform = useEmbedPlatform();
  const [page, setPage] = useState(initialPage);
  const [tab, setTab] = useState<'chat' | 'link'>('link');
  const touchedTab = useRef(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const close = () => {
    if (!savingRef.current) {
      onClose();
    }
  };
  const [role, setRole] = useState<'reader' | 'editor'>('reader');
  const query = useDoc(
    { id: snapshot.id },
    { queryKey: ['doc', { id: snapshot.id }], refetchOnMount: 'always' },
  );
  const doc = query.data || snapshot;
  useDocAccessRefreshBridge(doc.id);
  useEffect(() => {
    if (!touchedTab.current && canChat) {
      setTab('chat');
    }
    if (!canChat) {
      setTab('link');
    }
  }, [canChat]);
  if (page === 'members') {
    return <DocMembersModal doc={doc} isRootDoc={isRootDoc} onClose={close} />;
  }
  const membersEntry = doc.abilities.accesses_view ? (
    <Button
      variant="tertiary"
      disabled={saving}
      onClick={() => setPage('members')}
    >
      {t('Members and permissions')}
    </Button>
  ) : (
    <span />
  );
  const activeTab = canChat ? tab : 'link';
  return (
    <Modal
      isOpen
      onClose={close}
      closeOnClickOutside
      size={ModalSize.MEDIUM}
      aria-label={t('Share the document')}
      hideCloseButton
      title={
        <Box $direction="row" $justify="space-between" $align="center">
          <Box>
            <Text as="h1" $size="20px" $weight="600" $margin="0">
              {t('Share the document')}
            </Text>
            <Text $size="sm" $variation="secondary">
              {doc.title || t('Untitled document')}
            </Text>
          </Box>
          <ButtonCloseModal
            onClick={close}
            aria-label={t('Close the share modal')}
          />
        </Box>
      }
    >
      <ShareStyle />
      <div className="doc-sharing-layout" data-testid="doc-share-modal">
        {canChat && (
          <div
            className="doc-sharing-tabs"
            role="tablist"
            aria-label={t('Sharing method')}
            onKeyDown={(event) => {
              if (
                !saving &&
                (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
              ) {
                event.preventDefault();
                touchedTab.current = true;
                setTab(activeTab === 'chat' ? 'link' : 'chat');
                const buttons =
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                buttons[activeTab === 'chat' ? 1 : 0]?.focus();
              }
            }}
          >
            {(['chat', 'link'] as const).map((value) => (
              <Button
                key={value}
                role="tab"
                aria-selected={activeTab === value}
                tabIndex={activeTab === value ? 0 : -1}
                variant={activeTab === value ? 'primary' : 'tertiary'}
                onClick={() => {
                  touchedTab.current = true;
                  setTab(value);
                }}
              >
                {value === 'chat' ? t('Share to chat') : t('Link sharing')}
              </Button>
            ))}
          </div>
        )}
        {query.isPending ? (
          <div className="doc-sharing-scroll" role="status">
            {t('Loading…')}
          </div>
        ) : query.isError ? (
          <div className="doc-sharing-scroll">
            <p role="alert">{t('Could not load document permissions.')}</p>
            <Button onClick={() => void query.refetch()}>{t('Retry')}</Button>
          </div>
        ) : (
          <>
            <div
              hidden={activeTab !== 'link'}
              className={
                activeTab === 'link' ? 'doc-sharing-layout' : undefined
              }
            >
              <DocLinkSharePanel
                doc={doc}
                footerStart={membersEntry}
                onBusyChange={(value) => {
                  savingRef.current = value;
                  setSaving(value);
                }}
              />
            </div>
            <div hidden={activeTab !== 'chat'}>
              <div className="doc-sharing-scroll">
                <p>
                  {t(
                    'Choose a conversation or colleagues to send this document card.',
                  )}
                </p>
                {doc.abilities.accesses_manage ? (
                  <fieldset className="doc-sharing-options">
                    <legend>{t('Grant recipients access')}</legend>
                    {(['reader', 'editor'] as const).map((value) => (
                      <label key={value} className="doc-sharing-option">
                        <input
                          type="radio"
                          name="chat-share-role"
                          checked={role === value}
                          onChange={() => setRole(value)}
                        />
                        <span>
                          {value === 'reader' ? t('Can read') : t('Can edit')}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ) : (
                  <p className="doc-sharing-hint">
                    {t(
                      'Sending a card does not change permissions because you cannot manage this document.',
                    )}
                  </p>
                )}
                <p className="doc-sharing-hint">
                  {t('Chat sharing does not change the link access scope.')}
                </p>
              </div>
              <div className="doc-sharing-footer">
                {membersEntry}
                <Button
                  disabled={!doc.abilities.retrieve}
                  onClick={() =>
                    sendToHost({
                      type: 'wemeet-share-doc',
                      docId: doc.id,
                      title: doc.title,
                      url: `${window.location.origin}/docs/${doc.id}/`,
                      role,
                      canManage: doc.abilities.accesses_manage,
                    })
                  }
                >
                  {t('Choose chats')}
                </Button>
              </div>
            </div>
          </>
        )}
        {!canChat &&
          (platform === 'app' || (platform === 'web' && hasLegacyHost)) && (
            <div className="doc-sharing-footer">
              <Button
                variant="secondary"
                onClick={() =>
                  sendToHost({
                    type: 'wemeet-share-doc',
                    docId: doc.id,
                    title: doc.title,
                    url: `${window.location.origin}/docs/${doc.id}/`,
                  })
                }
              >
                {t('Share to chat')}
              </Button>
            </div>
          )}
      </div>
    </Modal>
  );
}
