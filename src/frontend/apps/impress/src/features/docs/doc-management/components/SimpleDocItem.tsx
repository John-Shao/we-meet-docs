import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import ArrowSVG from '@/assets/icons/ui-kit/arrow-corner-down-right.svg';
import { Box, Icon, Text } from '@/components';
import { useCunninghamTheme } from '@/cunningham';
import { useDate } from '@/hooks/useDate';
import { useResponsiveStore } from '@/stores';

import { useDocUtils, useTrans } from '../hooks';
import { Doc } from '../types';

import { DocTypeIcon } from './DocTypeIcon';

const ItemTextCss = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: initial;
  display: -webkit-box;
  line-clamp: 1;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  justify-content: center;
`;

type SimpleDocItemProps = {
  doc: Doc;
  breadcrumb?: string;
  isPinned?: boolean;
  showDate?: boolean;
  hasChildren?: boolean;
};

export const SimpleDocItem = ({
  doc,
  isPinned = false,
  showDate = false,
  breadcrumb,
  hasChildren: treeHasChildren,
}: SimpleDocItemProps) => {
  const { t } = useTranslation();
  const { isSmallMobile } = useResponsiveStore();
  const { spacingsTokens } = useCunninghamTheme();
  const { untitledDocument } = useTrans();
  const { hasChildren: storedHasChildren } = useDocUtils(doc);
  const hasChildren = treeHasChildren ?? storedHasChildren;
  const { relativeDate, formatDate } = useDate();
  const docTitle = doc.title || untitledDocument;
  const docRelativeUpdate = relativeDate(doc.updated_at);
  const itemAriaLabel = `${t('Open document {{title}}', { title: docTitle })}. ${t(
    'Last update: {{update}}',
    {
      update: formatDate(doc.updated_at),
    },
  )}`;

  return (
    <Box
      $direction="row"
      $gap={spacingsTokens.sm}
      $overflow="auto"
      $width="100%"
      className="--docs--simple-doc-item"
      aria-label={
        hasChildren
          ? `${itemAriaLabel}. ${t('Contains subdocuments')}`
          : itemAriaLabel
      }
    >
      <Box
        $direction="row"
        $align="center"
        $justify="center"
        $width="32px"
        $flex="0 0 32px"
        $css={css`
          background-color: transparent;
          filter: drop-shadow(0px 2px 2px rgba(0, 0, 0, 0.05));
        `}
        $padding={`${spacingsTokens['3xs']} 0`}
        data-testid={isPinned ? `doc-pinned-${doc.id}` : undefined}
        aria-hidden="true"
      >
        <DocTypeIcon folder={hasChildren} />
      </Box>
      <Box $justify="center" $overflow="auto" $gap="4xs">
        <Box $direction="row" $align="center" $gap="3xs">
          <Text
            $size="sm"
            $weight="500"
            $css={ItemTextCss}
            data-testid="doc-title"
            title={docTitle}
          >
            {docTitle}
          </Text>
          {isPinned && (
            <Icon
              iconName="push_pin"
              $size="sm"
              aria-hidden="true"
              data-testid="doc-pinned-icon"
              style={{ flexShrink: 0 }}
            />
          )}
        </Box>

        {(showDate || breadcrumb) && (
          <Box
            $direction={isSmallMobile ? 'column' : 'row'}
            $align={isSmallMobile ? 'flex-start' : 'center'}
            aria-hidden="true"
          >
            {breadcrumb && (
              <Box $direction="row" $align="center" $gap="3xs">
                <ArrowSVG
                  width="16px"
                  height="16px"
                  aria-hidden="true"
                  color="var(--c--contextuals--content--semantic--neutral--tertiary)"
                />
                <Text $size="xs" $variation="tertiary" $css={ItemTextCss}>
                  {breadcrumb}
                </Text>
              </Box>
            )}
            {breadcrumb && showDate && !isSmallMobile && (
              <Text $size="xs" $variation="tertiary">
                &nbsp;·&nbsp;
              </Text>
            )}
            {showDate && (
              <Text $size="xs" $variation="tertiary" $shrink="0">
                {docRelativeUpdate}
              </Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
