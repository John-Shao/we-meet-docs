import { Button } from '@gouvfr-lasuite/cunningham-react';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import {
  Box,
  ButtonCloseModal,
  SeparatedSection,
  StyledLink,
  Text,
} from '@/components';
import { Title } from '@/components/Title';
import { useConfig } from '@/core';
import { NewDocButton } from '@/docs/doc-management/components/NewDocButton';
import { DocSearchButtonModal } from '@/docs/doc-search/components/DocSearchButtonModal';
import { useAuth } from '@/features/auth';
import { useEmbedPlatform } from '@/hooks/useEmbedShell';
import HomeSVG from '@/icons/house-rounded.svg';
import { useResponsiveStore } from '@/stores';

import DoubleArrowLeftIcon from '../assets/double-arrow-left.svg';
import { useLeftPanelStore } from '../stores';

export const LeftPanelHeader = () => {
  const { data: config } = useConfig();
  const { isMobile } = useResponsiveStore();
  const { closePanel } = useLeftPanelStore();
  const icon = config?.theme_customization?.header?.icon;
  // 被 we-meet 内嵌时隐掉这行 logo/标题:宿主的一级 rail 顶部已经有 logo,
  // 且是另一套品牌 —— 两个 logo 上下叠着正是「像换了个 App」的直接来源。
  // 内嵌时改成一栏「标题 + 模块动作」:形态与宿主其它模块的二级导航栏一致
  // (16px bold 标题、56px 高、1px 底分割线,见 we-meet-ui.css 的 .wm-subnav-header)。
  const isEmbedded = useEmbedPlatform() !== null;

  return (
    <Box $width="100%" className="--docs--left-panel-header">
      {(!isEmbedded || isMobile) && (
        <Box
          $padding={{ horizontal: 'sm' }}
          $direction="row"
          $align="center"
          $gap="2xs"
          // 内嵌时这行只剩关闭按钮,不必再占 logo 那 68px 的高。
          $minHeight={isEmbedded ? undefined : '68px'}
        >
          {!isEmbedded && (
            <StyledLink
              href="/"
              data-testid="header-logo-link"
              $css={css`
                outline: none;
                @media screen and (width <= 768px) {
                  min-height: var(--wm-interaction-target-min);
                }
                &:focus-visible {
                  box-shadow: 0 0 0 2px var(--c--globals--colors--brand-400) !important;
                  border-radius: var(--wm-radius-control);
                }
              `}
            >
              <Box
                $align="center"
                $gap="var(--c--globals--spacings--4xs)"
                $direction="row"
                $position="relative"
                $height="fit-content"
                $margin={{ top: 'auto' }}
              >
                {icon && (
                  <Image
                    data-testid="header-icon-docs"
                    width={0}
                    height={0}
                    priority
                    {...(({ withTitle: _, ...rest }) => rest)(icon)}
                  />
                )}
                <Title
                  headingLevel="h1"
                  className={icon?.withTitle ? undefined : 'sr-only'}
                  $size="1.8rem"
                />
              </Box>
            </StyledLink>
          )}
          {/* 抽屉关闭按钮必须留着:App 的左栏是抽屉式的,连它一起隐掉就关不上了。 */}
          {isMobile && (
            <Box $margin={{ left: 'auto' }}>
              <ButtonCloseModal
                onClick={closePanel}
                aria-label="Close left panel"
              />
            </Box>
          )}
        </Box>
      )}
      <LeftPanelHeaderActions withTitle={isEmbedded && !isMobile} />
    </Box>
  );
};
export const LeftPanelHeaderActions = ({
  withTitle = false,
}: {
  /**
   * 内嵌(we-meet)时这一栏走宿主 `SubNavHeader` 的形态:标题在左,模块图标动作在右,
   * **收起按钮排在最后一个**。收起后由浮动【导航栏】按钮担展开入口
   * (HeaderFloatingBar / DocFloatingBar,不占屏宽)。独立访问 docs 时仍是原来的
   * 「新建 + 主页/搜索」一行。
   */
  withTitle?: boolean;
}) => {
  const router = useRouter();
  const { authenticated } = useAuth();
  const { togglePanel, closePanel } = useLeftPanelStore();
  const { t } = useTranslation();
  const { isMobile } = useResponsiveStore();

  const goToHome = () => {
    void router.push('/');

    if (isMobile) {
      togglePanel();
    }
  };

  // 内嵌栏头的动作按宿主的图标钮尺寸(28px 按钮 + 20px 图标);独立形态维持原样。
  const homeButton = router.pathname !== '/' && (
    <Button
      data-testid="home-button"
      onClick={goToHome}
      aria-label={t('Back to homepage')}
      size={withTitle ? 'small' : 'medium'}
      color={withTitle ? 'neutral' : 'brand'}
      variant="tertiary"
      icon={
        <HomeSVG
          aria-hidden="true"
          width={withTitle ? 20 : 24}
          height={withTitle ? 20 : 24}
        />
      }
    />
  );

  if (withTitle) {
    return (
      <Box className="wm-subnav-header">
        <Text as="h2" className="wm-subnav-header__title">
          {t('Docs')}
        </Text>
        {/*
          新建不再挂在二级导航栏:宿主把模块主操作放在**内容标题栏**右侧(见
          DocGridTitleBar),二级导航栏栏头只留图标动作 + 收起按钮。
        */}
        <Box className="wm-subnav-header__actions">
          {homeButton}
          <DocSearchButtonModal size="small" color="neutral" />
          <Button
            data-testid="left-panel-collapse"
            onClick={() => closePanel()}
            aria-label={t('Toggle left panel')}
            title={t('Toggle left panel')}
            size="small"
            color="neutral"
            variant="tertiary"
            icon={
              <DoubleArrowLeftIcon width={20} height={20} aria-hidden="true" />
            }
          />
        </Box>
      </Box>
    );
  }

  return (
    <SeparatedSection>
      <Box
        $padding={{ horizontal: 'sm' }}
        $width="100%"
        $direction="row"
        $justify="space-between"
        $align="center"
      >
        {authenticated && (
          <NewDocButton onClose={() => isMobile && closePanel()} />
        )}
        <Box $direction="row" $gap="2px" $margin={{ left: 'auto' }}>
          {homeButton}
          <DocSearchButtonModal />
        </Box>
      </Box>
    </SeparatedSection>
  );
};
