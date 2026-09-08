import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';
import {
  QuickSearchItemContent,
  QuickSearchItemContentProps,
} from '@/components/quick-search';
import { useCunninghamTheme } from '@/cunningham';
import { User, UserAvatar } from '@/features/auth';

type Props = {
  user: User;
  alwaysShowRight?: boolean;
  right?: QuickSearchItemContentProps['right'];
  isInvitation?: boolean;
};

export const SearchUserRow = ({
  user,
  right,
  alwaysShowRight = false,
  isInvitation = false,
}: Props) => {
  const { t } = useTranslation();
  const name =
    user.full_name || user.short_name || user.email || t('Unknown user');
  const { spacingsTokens, colorsTokens } = useCunninghamTheme();

  return (
    <QuickSearchItemContent
      right={right}
      alwaysShowRight={alwaysShowRight}
      left={
        <Box
          $direction="row"
          $align="center"
          $gap={spacingsTokens['xs']}
          className="--docs--search-user-row"
        >
          <UserAvatar
            fullName={name}
            background={isInvitation ? colorsTokens['gray-400'] : undefined}
          />
          <Box $direction="column">
            <Text
              $size="sm"
              $weight="500"
              $css={css`
                line-break: anywhere;
              `}
            >
              {name}
            </Text>
            {user.email &&
              name !== user.email &&
              !user.email.endsWith('@phone.we-meet.online') && (
                <Text
                  $size="xs"
                  $margin={{ top: '-2px' }}
                  $variation="secondary"
                  $css={css`
                    line-break: anywhere;
                  `}
                >
                  {user.email}
                </Text>
              )}
          </Box>
        </Box>
      }
    />
  );
};
