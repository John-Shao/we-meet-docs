import { Button, Modal, ModalSize } from '@gouvfr-lasuite/cunningham-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';

import { Doc, useDoc } from '@/docs/doc-management';
import { useEmbedPlatform, useHostFeature } from '@/hooks/useEmbedShell';
import { sendToHost } from '@/hooks/useIsEmbedded';

import { useDocAccessRefreshBridge } from '../hooks/useDocAccessRefreshBridge';

import { DocLinkSharePanel } from './DocLinkSharePanel';
import { DocMembersModal } from './DocMembersModal';
import { DocModalHeader } from './DocModalHeader';

const ShareStyle = createGlobalStyle`
  .doc-sharing-layout { display: flex; flex-direction: column; min-height: 0; font: var(--wm-font-body-medium); }
  .doc-sharing-tabs { display: flex; flex-shrink: 0; align-items: center; gap: 4px; padding: var(--wm-space-md) var(--wm-space-lg) 0; border-bottom: 1px solid var(--c--contextuals--border--surface--primary); }
  .doc-sharing-tab { display: inline-flex; align-items: center; justify-content: center; min-width: 5rem; min-height: var(--wm-control-height-compact); padding: 6px 12px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--c--contextuals--content--semantic--neutral--secondary); font: inherit; font-size: var(--c--globals--font--sizes--sm); font-weight: var(--c--globals--font--weights--medium); line-height: 1.428571; letter-spacing: 0.1px; cursor: pointer; transition: color 150ms, border-color 150ms, background-color 150ms; }
  .doc-sharing-tab:hover:not(:disabled) { background: var(--c--contextuals--background--surface--secondary); color: var(--c--contextuals--content--semantic--neutral--primary); }
  .doc-sharing-tab[aria-selected='true'] { border-bottom-color: var(--c--contextuals--border--semantic--brand--primary); color: var(--c--contextuals--content--semantic--brand--primary); }
  .doc-sharing-tab:focus-visible { outline: 2px solid var(--c--contextuals--border--semantic--brand--primary); outline-offset: -2px; }
  .doc-sharing-tab:disabled { color: var(--c--contextuals--content--semantic--neutral--tertiary); cursor: default; }
  .doc-sharing-scroll { overflow-y: auto; min-height: 0; padding: var(--wm-space-lg); }
  .doc-sharing-footer { display: flex; flex-shrink: 0; justify-content: flex-end; gap: 12px; padding: var(--wm-space-lg); border-top: 1px solid var(--c--contextuals--border--surface--primary); }
  .doc-sharing-options { padding: 0; border: 0; margin: 0 0 24px; }
  .doc-sharing-options legend { font: var(--wm-font-title-small); margin-bottom: var(--wm-space-md); }
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
  const tabsId = useId();
  const canChat = useHostFeature('docs-sharing-v2');
  const hasLegacyHost = useHostFeature('route-sync');
  const platform = useEmbedPlatform();
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
  if (initialPage === 'members') {
    return <DocMembersModal doc={doc} isRootDoc={isRootDoc} onClose={close} />;
  }
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
        <DocModalHeader
          title={t('Share the document')}
          documentTitle={doc.title}
          onClose={close}
          closeLabel={t('Close the share modal')}
        />
      }
    >
      <ShareStyle />
      <div
        className="doc-sharing-layout wm-modal-edge"
        data-testid="doc-share-modal"
      >
        {canChat && (
          <div
            className="doc-sharing-tabs"
            role="tablist"
            aria-label={t('Sharing method')}
            onKeyDown={(event) => {
              if (saving) {
                return;
              }
              let nextTab: 'chat' | 'link';
              switch (event.key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                  nextTab = activeTab === 'chat' ? 'link' : 'chat';
                  break;
                case 'Home':
                  nextTab = 'chat';
                  break;
                case 'End':
                  nextTab = 'link';
                  break;
                default:
                  return;
              }
              event.preventDefault();
              touchedTab.current = true;
              setTab(nextTab);
              const buttons =
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                );
              buttons[nextTab === 'chat' ? 0 : 1]?.focus();
            }}
          >
            {(['chat', 'link'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="doc-sharing-tab"
                id={`${tabsId}-${value}-tab`}
                aria-controls={`${tabsId}-${value}-panel`}
                role="tab"
                aria-selected={activeTab === value}
                tabIndex={activeTab === value ? 0 : -1}
                disabled={saving}
                onClick={() => {
                  touchedTab.current = true;
                  setTab(value);
                }}
              >
                {value === 'chat' ? t('Share to chat') : t('Link sharing')}
              </button>
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
              id={`${tabsId}-link-panel`}
              role={canChat ? 'tabpanel' : undefined}
              aria-labelledby={canChat ? `${tabsId}-link-tab` : undefined}
              hidden={activeTab !== 'link'}
              className={
                activeTab === 'link' ? 'doc-sharing-layout' : undefined
              }
            >
              <DocLinkSharePanel
                doc={doc}
                onCopied={close}
                onBusyChange={(value) => {
                  savingRef.current = value;
                  setSaving(value);
                }}
              />
            </div>
            <div
              id={`${tabsId}-chat-panel`}
              role={canChat ? 'tabpanel' : undefined}
              aria-labelledby={canChat ? `${tabsId}-chat-tab` : undefined}
              hidden={activeTab !== 'chat'}
              className={
                activeTab === 'chat' ? 'doc-sharing-layout' : undefined
              }
            >
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
              <div className="doc-sharing-footer wm-modal-footer">
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
            <div className="doc-sharing-footer wm-modal-footer">
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
