import { UserMenu } from '@gouvfr-lasuite/ui-kit';
import { useTranslation } from 'react-i18next';

import { Box, SeparatedSection } from '@/components';
import { Waffle } from '@/components/Waffle';
import { ButtonLogin } from '@/features/auth';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { gotoLogout } from '@/features/auth/utils';
import { HelpMenu } from '@/features/help';
import { useIsEmbedded } from '@/hooks/useIsEmbedded';
import { LanguagePicker } from '@/features/language/components/LanguagePicker';

export const LeftPanelFooter = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // 被 meet 框架内嵌时（?embed=1）隐藏 docs 自带的退出 / 语言切换，收敛到外层框架：
  // 退出走 meet 的登出（同 Keycloak SSO）；语言由 meet 经 ?lang= 驱动（见 initI18n）。
  const isEmbedded = useIsEmbedded();

  const userMenu = user || {
    full_name: t('Guest'),
    email: '',
  };

  return (
    <SeparatedSection showSeparator="top" $margin={{ top: 'auto' }}>
      <Box
        $padding={{ horizontal: 'sm' }}
        $justify="space-between"
        $direction="row"
      >
        <Box $direction="row" $align="center" $gap="0.2rem">
          <UserMenu
            user={userMenu}
            logout={user && !isEmbedded ? gotoLogout : undefined}
            actions={isEmbedded ? undefined : <LanguagePicker />}
            withMobileView={false}
          />
          <Waffle />
          <ButtonLogin />
        </Box>
        <HelpMenu />
      </Box>
    </SeparatedSection>
  );
};
