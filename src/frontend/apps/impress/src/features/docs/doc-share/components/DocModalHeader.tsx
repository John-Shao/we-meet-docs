import { useTranslation } from 'react-i18next';

import { Box, ButtonCloseModal, Text } from '@/components';

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
    <Box $direction="row" $align="center" $gap="tiny" $minWidth="0">
      <Text
        as="h1"
        $direction="row"
        $align="center"
        $gap="tiny"
        $flex="1"
        $minWidth="0"
        $size="20px"
        $weight="600"
        $margin="0"
      >
        <Text $flex="0 0 auto">{title}</Text>
        <Text
          $display="block"
          $minWidth="0"
          $size="sm"
          $weight="400"
          $variation="secondary"
          $ellipsis
          title={name}
        >
          {t('({{title}})', { title: name })}
        </Text>
      </Text>
      <Box $flex="0 0 auto">
        <ButtonCloseModal onClick={onClose} aria-label={closeLabel} />
      </Box>
    </Box>
  );
}
