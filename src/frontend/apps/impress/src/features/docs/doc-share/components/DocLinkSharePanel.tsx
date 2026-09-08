import {
  Button,
  VariantType,
  useToastProvider,
} from '@gouvfr-lasuite/cunningham-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Doc,
  KEY_DOC,
  KEY_LIST_DOC,
  LinkReach,
  LinkRole,
  getDocLinkReach,
  getDocLinkRole,
} from '@/docs/doc-management';

import { updateDocLink } from '../api/useUpdateDocLink';

export function DocLinkSharePanel({
  doc,
  onBusyChange,
  onCopied,
}: {
  doc: Doc;
  onBusyChange?: (busy: boolean) => void;
  onCopied?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToastProvider();
  const queryClient = useQueryClient();
  const [reach, setReach] = useState(getDocLinkReach(doc));
  const [role, setRole] = useState(getDocLinkRole(doc) || LinkRole.READER);
  const [saved, setSaved] = useState({
    reach: getDocLinkReach(doc),
    role: getDocLinkRole(doc),
  });
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'copy-failed' | 'save-failed' | null>(
    null,
  );
  const canManage = doc.abilities.link_configuration;
  const remoteReach = getDocLinkReach(doc);
  const remoteRole = getDocLinkRole(doc);
  useEffect(() => {
    if (
      reach === saved.reach &&
      (reach === LinkReach.RESTRICTED || role === saved.role)
    ) {
      setReach(remoteReach);
      setRole(remoteRole || LinkRole.READER);
    }
    setSaved({ reach: remoteReach, role: remoteRole });
    // Only remote changes refresh an untouched draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteReach, remoteRole]);
  const labels = {
    [LinkReach.RESTRICTED]: t('Authorized users only'),
    [LinkReach.AUTHENTICATED]: t('Signed-in users'),
    [LinkReach.PUBLIC]: t('Anyone with the link'),
  };
  const descriptions = {
    [LinkReach.RESTRICTED]: t(
      'Copying the link does not grant access. Existing user permissions apply.',
    ),
    [LinkReach.AUTHENTICATED]: t('Users must sign in to open this link.'),
    [LinkReach.PUBLIC]: t(
      'Anyone who obtains the link can open this document.',
    ),
  };
  const roles = doc.abilities.link_select_options[reach] || [];
  const roleLabels = {
    [LinkRole.READER]: t('Can read'),
    [LinkRole.COMMENTER]: t('Commenter'),
    [LinkRole.EDITOR]: t('Can edit'),
  };
  const changeReach = (value: LinkReach) => {
    setReach(value);
    setStatus(null);
    const allowed = doc.abilities.link_select_options[value] || [];
    if (!allowed.includes(role)) {
      setRole(allowed[0] || LinkRole.READER);
    }
  };
  const saveAndCopy = async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setStatus(null);
    try {
      if (
        canManage &&
        (reach !== saved.reach ||
          (reach !== LinkReach.RESTRICTED && role !== saved.role))
      ) {
        await updateDocLink({
          id: doc.id,
          link_reach: reach,
          ...(reach === LinkReach.RESTRICTED ? {} : { link_role: role }),
        });
        setSaved({ reach, role });
        void queryClient.invalidateQueries({ queryKey: [KEY_DOC] });
        void queryClient.invalidateQueries({ queryKey: [KEY_LIST_DOC] });
      }
    } catch {
      setStatus('save-failed');
      running.current = false;
      setBusy(false);
      onBusyChange?.(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/docs/${doc.id}/`,
      );
    } catch {
      setStatus('copy-failed');
      return;
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
    toast(t('Link Copied !'), VariantType.SUCCESS, { duration: 3000 });
    onCopied?.();
  };
  return (
    <>
      <div className="doc-sharing-scroll">
        <fieldset disabled={!canManage || busy} className="doc-sharing-options">
          <legend>{t('Link access scope')}</legend>
          {Object.values(LinkReach).map((value) => (
            <label className="doc-sharing-option" key={value}>
              <input
                type="radio"
                name={`link-reach-${doc.id}`}
                value={value}
                checked={reach === value}
                disabled={
                  !Object.prototype.hasOwnProperty.call(
                    doc.abilities.link_select_options,
                    value,
                  )
                }
                onChange={() => changeReach(value)}
              />
              <span>
                <strong>{labels[value]}</strong>
                <small>{descriptions[value]}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {reach !== LinkReach.RESTRICTED && (
          <fieldset
            disabled={!canManage || busy}
            className="doc-sharing-options"
          >
            <legend>{t('Link permission')}</legend>
            {Object.values(LinkRole).map((value) => (
              <label className="doc-sharing-option" key={value}>
                <input
                  type="radio"
                  name={`link-role-${doc.id}`}
                  checked={role === value}
                  disabled={!roles.includes(value)}
                  onChange={() => {
                    setRole(value);
                    setStatus(null);
                  }}
                />
                <span>{roleLabels[value]}</span>
              </label>
            ))}
          </fieldset>
        )}
        {!canManage && (
          <p className="doc-sharing-hint">
            {t('Only document managers can change link settings.')}
          </p>
        )}
        {status && (
          <p role="alert">
            {status === 'save-failed'
              ? t(
                  'Could not save link settings. Nothing was copied. Please retry.',
                )
              : t('Link settings are saved. Select and copy the link below.')}
          </p>
        )}
        {status === 'copy-failed' && (
          <input
            aria-label={t('Document link')}
            className="doc-sharing-url"
            readOnly
            value={`${window.location.origin}/docs/${doc.id}/`}
            onFocus={(event) => event.target.select()}
          />
        )}
      </div>
      <div className="doc-sharing-footer wm-modal-footer">
        <Button
          onClick={() => void saveAndCopy()}
          disabled={
            busy ||
            (canManage &&
              reach !== LinkReach.RESTRICTED &&
              !roles.includes(role))
          }
        >
          {busy
            ? t('Saving…')
            : canManage
              ? t('Save and copy link')
              : t('Copy link')}
        </Button>
      </div>
    </>
  );
}
