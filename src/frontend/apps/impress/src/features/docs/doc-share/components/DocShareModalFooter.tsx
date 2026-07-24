import { Button } from '@gouvfr-lasuite/cunningham-react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, HorizontalSeparator, Icon } from '@/components';
import { Doc, useCopyDocLink } from '@/docs/doc-management';
import { sendToHost, useIsEmbedded } from '@/hooks/useIsEmbedded';

import { DocVisibility } from './DocVisibility';

type DocShareModalFooterProps = {
  doc: Doc;
  onClose: () => void;
};

export const DocShareModalFooter = ({
  doc,
  onClose,
}: DocShareModalFooterProps) => {
  const copyDocLink = useCopyDocLink(doc.id);
  const isEmbedded = useIsEmbedded();
  const { t } = useTranslation();
  const shareToChat = () =>
    sendToHost({
      type: 'wemeet-share-doc',
      docId: doc.id,
      title: doc.title,
      url: `${window.location.origin}/docs/${doc.id}/`,
    });
  return (
    <Box
      $css={css`
        flex-shrink: 0;
      `}
      className="--docs--doc-share-modal-footer"
    >
      <HorizontalSeparator $margin={{ vertical: 'sm' }} />

      <DocVisibility doc={doc} />
      <HorizontalSeparator $margin={{ vertical: 'sm' }} />

      <Box
        $direction="row"
        $justify="space-between"
        $padding={{ horizontal: 'base', bottom: 'base' }}
      >
        <Box $direction="row" $gap="0.5rem">
          <Button
            fullWidth={false}
            onClick={copyDocLink}
            variant="secondary"
            icon={<Icon iconName="add_link" $withThemeInherited />}
          >
            {t('Copy link')}
          </Button>
          {isEmbedded && (
            <Button
              fullWidth={false}
              onClick={shareToChat}
              variant="secondary"
              icon={<Icon iconName="chat" $withThemeInherited />}
            >
              {t('Share to chat')}
            </Button>
          )}
        </Box>
        <Button onClick={onClose}>{t('OK')}</Button>
      </Box>
    </Box>
  );
};
