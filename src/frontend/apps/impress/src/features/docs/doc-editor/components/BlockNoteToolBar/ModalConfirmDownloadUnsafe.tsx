import { Button, Modal, ModalSize } from '@gouvfr-lasuite/cunningham-react';
import { useTranslation } from 'react-i18next';

import { Box, ModalHeader, Text } from '@/components';

interface ModalConfirmDownloadUnsafeProps {
  onClose: () => void;
  onConfirm?: () => Promise<void> | void;
}

export const ModalConfirmDownloadUnsafe = ({
  onConfirm,
  onClose,
}: ModalConfirmDownloadUnsafeProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen
      hideCloseButton
      closeOnClickOutside
      onClose={() => onClose()}
      aria-label={t('Warning')}
      rightActions={
        <>
          <Button
            aria-label={t('Cancel the download')}
            autoFocus
            variant="secondary"
            onClick={() => onClose()}
          >
            {t('Cancel')}
          </Button>
          <Button
            aria-label={t('Download')}
            color="error"
            data-testid="modal-download-unsafe-button"
            onClick={() => {
              if (onConfirm) {
                void onConfirm();
              }
              onClose();
            }}
          >
            {t('Download anyway')}
          </Button>
        </>
      }
      size={ModalSize.SMALL}
      title={
        <ModalHeader
          title={t('Warning')}
          titleId="modal-confirm-download-unsafe-title"
          closeLabel={t('Close')}
          onClose={onClose}
        />
      }
    >
      <Box className="--docs--modal-confirm-download-unsafe">
        <Box>
          <Box $direction="column" $gap="0.35rem" $margin={{ top: 'sm' }}>
            <Text $variation="secondary">
              {t('This file is flagged as unsafe.')}
            </Text>
            <Text $variation="secondary">
              {t('Please download it only if it comes from a trusted source.')}
            </Text>
          </Box>
        </Box>
      </Box>
    </Modal>
  );
};
