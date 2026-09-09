import { useTranslation } from 'react-i18next';

import { Icon } from '@/components';

export const DocTypeIcon = ({
  folder = false,
  size = '24px',
}: {
  folder?: boolean;
  size?: string;
}) => {
  const { t } = useTranslation();

  return (
    <Icon
      className="--docs--doc-type-icon"
      iconName={folder ? 'folder' : 'description'}
      variant="outlined"
      $size={size}
      style={{
        flexShrink: 0,
        lineHeight: 1,
        color: 'var(--c--contextuals--content--semantic--info--tertiary)',
      }}
      title={folder ? t('Contains subdocuments') : undefined}
      aria-label={folder ? t('Contains subdocuments') : undefined}
      aria-hidden={!folder}
      data-testid={folder ? 'doc-folder-icon' : 'doc-simple-icon'}
    />
  );
};
