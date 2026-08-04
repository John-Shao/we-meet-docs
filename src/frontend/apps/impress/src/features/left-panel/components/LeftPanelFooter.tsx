import { UserMenu } from '@gouvfr-lasuite/ui-kit';
import { useTranslation } from 'react-i18next';

import { Box, SeparatedSection } from '@/components';
import { Waffle } from '@/components/Waffle';
import { ButtonLogin } from '@/features/auth';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { gotoLogout } from '@/features/auth/utils';
import { HelpMenu } from '@/features/help';
import { LanguagePicker } from '@/features/language/components/LanguagePicker';
import { useEmbedPlatform } from '@/hooks/useEmbedShell';

export const LeftPanelFooter = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  // 被 meet 框架内嵌时整块隐藏 docs 自带的用户区（头像+邮箱+退出+语言+Waffle），收敛到
  // 外层 meet 框架：退出走 meet 的登出（同 Keycloak SSO）；语言由 meet 经 ?lang= 驱动（见 initI18n）。
  //
  // 判据用 useEmbedPlatform 而不是 useIsEmbedded:后者认 sessionStorage 里那条**持久**
  // 标记,同一标签页先被内嵌过、之后手动开 docs 独立页会误判。以前误判只是少一块用户区,
  // 现在整个页脚都没了,代价大得多。
  const isEmbedded = useEmbedPlatform() !== null;

  const userMenu = user || {
    full_name: t('Guest'),
    email: '',
  };

  // 内嵌时整个页脚都不渲染。此前只隐了用户区、留下 HelpMenu(帮助/反馈同样该由 meet
  // 统一),结果是一整条分隔线 + 一行高度只为托一个图标 —— 在收窄成「模块二级面板」的
  // 左栏里格外显眼。
  if (isEmbedded) {
    return null;
  }

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
            logout={user ? gotoLogout : undefined}
            actions={<LanguagePicker />}
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
