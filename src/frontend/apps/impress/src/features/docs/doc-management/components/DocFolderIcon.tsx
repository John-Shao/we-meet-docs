import { useTranslation } from 'react-i18next';

import { Icon } from '@/components';

export const DocFolderIcon = ({ size = '24px' }: { size?: string }) => {
  const { t } = useTranslation();

  return (
    <Icon
      iconName="folder"
      $size={size}
      style={{
        flexShrink: 0,
        lineHeight: 1,
        color: 'var(--c--contextuals--content--semantic--info--tertiary)',
      }}
      title={t('Contains subdocuments')}
      aria-label={t('Contains subdocuments')}
      data-testid="doc-folder-icon"
    />
  );
};
