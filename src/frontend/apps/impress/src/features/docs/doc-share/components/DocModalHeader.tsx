import { useTranslation } from 'react-i18next';

import { ModalHeader } from '@/components';

export function DocModalHeader({
  title,
  documentTitle,
  onClose,
  closeLabel,
}: {
  title: string;
  documentTitle?: string;
  onClose: () => void;
  closeLabel: string;
}) {
  const { t } = useTranslation();
  const name = documentTitle || t('Untitled document');

  return (
    <ModalHeader
      title={title}
      documentTitle={name}
      documentTitleLabel={t('({{title}})', { title: name })}
      onClose={onClose}
      closeLabel={closeLabel}
    />
  );
}
