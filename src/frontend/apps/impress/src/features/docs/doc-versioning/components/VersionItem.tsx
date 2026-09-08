import { useTranslation } from 'react-i18next';

import { BoxButton, Text } from '@/components';

interface VersionItemProps {
  text: string;
  isActive: boolean;
  onSelect?: () => void;
}

export const VersionItem = ({ text, isActive, onSelect }: VersionItemProps) => {
  const { t } = useTranslation();

  return (
    <BoxButton
      aria-label={t('Restore version of {{date}}', { date: text })}
      aria-pressed={isActive}
      $width="100%"
      className="version-item --docs--version-item"
      onClick={onSelect}
      $padding={{ vertical: 'm', horizontal: 'xs' }}
      $hasTransition
    >
      <Text $withThemeInherited $size="sm" $textAlign="left">
        {text}
      </Text>
    </BoxButton>
  );
};
