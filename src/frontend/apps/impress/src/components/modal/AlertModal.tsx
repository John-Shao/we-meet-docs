import {
  Button,
  ButtonProps,
  Modal,
  ModalDefaultVariantProps,
  ModalSize,
} from '@gouvfr-lasuite/cunningham-react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { Text } from '../Text';

import { ModalHeader } from './ModalHeader';

export type AlertModalProps = {
  description: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  themeCTA?: ButtonProps['color'];
  title: string;
  cancelLabel?: string;
  confirmLabel?: string;
} & Partial<ModalDefaultVariantProps>;

export const AlertModal = ({
  cancelLabel,
  confirmLabel,
  description,
  isOpen,
  onClose,
  onConfirm,
  title,
  themeCTA,
  ...props
}: AlertModalProps) => {
  const { t } = useTranslation();

  return (
    <Modal
      hideCloseButton
      closeOnClickOutside
      isOpen={isOpen}
      size={ModalSize.MEDIUM}
      onClose={onClose}
      aria-label={title}
      title={
        <ModalHeader
          title={title}
          titleId="alert-modal-title"
          onClose={onClose}
          closeLabel={t('Close')}
          closeDisabled={props.preventClose}
        />
      }
      rightActions={
        <Box $direction="row" $gap="small">
          <Button
            aria-label={`${t('Cancel')} - ${title}`}
            variant="secondary"
            autoFocus
            onClick={onClose}
          >
            {cancelLabel ?? t('Cancel')}
          </Button>
          <Button
            aria-label={confirmLabel ?? t('Confirm')}
            color={themeCTA ?? 'error'}
            onClick={onConfirm}
          >
            {confirmLabel ?? t('Confirm')}
          </Button>
        </Box>
      }
      {...props}
    >
      <Box className="--docs--alert-modal">
        <Box>
          <Text $variation="secondary" as="p">
            {description}
          </Text>
        </Box>
      </Box>
    </Modal>
  );
};
