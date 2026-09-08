import {
  Button,
  Modal,
  ModalSize,
  useModal,
} from '@gouvfr-lasuite/cunningham-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Box, Text } from '@/components';
import { Doc } from '@/docs/doc-management';
import { DocModalHeader } from '@/docs/doc-share/components/DocModalHeader';

import { Versions } from '../types';

import { DocVersionEditor } from './DocVersionEditor';
import { VersionList } from './VersionList';

const ModalConfirmationVersion = dynamic(
  () =>
    import('./ModalConfirmationVersion').then((mod) => ({
      default: mod.ModalConfirmationVersion,
    })),
  { ssr: false },
);

type ModalSelectVersionProps = {
  doc: Doc;
  onClose: () => void;
  initialVersionId?: string;
};

export const ModalSelectVersion = ({
  onClose,
  doc,
  initialVersionId,
}: ModalSelectVersionProps) => {
  const { t } = useTranslation();
  const [selectedVersionId, setSelectedVersionId] = useState<
    Versions['version_id'] | undefined
  >(initialVersionId);
  const canRestore = doc.abilities.partial_update;
  const restoreModal = useModal();

  return (
    <>
      <Modal
        isOpen
        hideCloseButton
        closeOnClickOutside={true}
        size={ModalSize.EXTRA_LARGE}
        onClose={onClose}
        aria-label={t('Version history')}
        title={
          <DocModalHeader
            title={t('Version history')}
            documentTitle={doc.title}
            closeLabel={t('Close the version history modal')}
            onClose={onClose}
          />
        }
        rightActions={
          canRestore ? (
            <Button disabled={!selectedVersionId} onClick={restoreModal.open}>
              {t('Restore')}
            </Button>
          ) : undefined
        }
      >
        <Box className="--docs--modal-select-version wm-version-layout wm-modal-edge">
          <Box className="wm-version-preview">
            {selectedVersionId ? (
              <DocVersionEditor docId={doc.id} versionId={selectedVersionId} />
            ) : (
              <Box
                className="wm-version-empty"
                $align="center"
                $justify="center"
              >
                <Text $size="sm" $variation="secondary">
                  {t('Select a version to preview')}
                </Text>
              </Box>
            )}
          </Box>
          <Box
            className="wm-version-sidebar wm-ui"
            aria-label={t('Version list')}
          >
            <Text as="h3" className="wm-version-list-title" $margin="none">
              {t('History')}
            </Text>
            <VersionList
              doc={doc}
              onSelectVersion={setSelectedVersionId}
              selectedVersionId={selectedVersionId}
            />
          </Box>
        </Box>
      </Modal>
      {restoreModal.isOpen && selectedVersionId && (
        <ModalConfirmationVersion
          onClose={() => {
            restoreModal.close();
          }}
          onSuccess={() => {
            restoreModal.close();
            onClose();
            setSelectedVersionId(undefined);
          }}
          docId={doc.id}
          versionId={selectedVersionId}
        />
      )}
    </>
  );
};
