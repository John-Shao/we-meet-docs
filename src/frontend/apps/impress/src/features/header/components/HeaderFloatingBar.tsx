import { useTranslation } from 'react-i18next';

import { FadeComponent } from '@/components/Effect';
import { FloatingBar } from '@/components/FloatingBar';
import { DocSearchButtonModal } from '@/features/docs/doc-search/components/DocSearchButtonModal';
import { LeftPanelCollapseButton } from '@/features/left-panel/components/LeftPanelCollapseButton';
import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import { useEmbedPlatform } from '@/hooks/useEmbedShell';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { HeaderIcon } from './HeaderIcon';

export const HeaderFloatingBar = () => {
  const { isMobile, isTablet, isLargeScreen } = useResponsiveStore();
  const { t } = useTranslation();
  const { isPanelOpen } = useLeftPanelStore();
  const isEmbedded = useEmbedPlatform() !== null;

  /**
   * 大屏(含 769–1023 这档 `isLargeScreen && isTablet` 的重叠区)左栏由「二级导航栏栏头的
   * 收起按钮 + 收起后的 36px 窄条」接管,浮动条再放一颗左栏开关就会出现**两个「导航栏」
   * 按钮**。只有"抽屉"那一档(窄屏,或未内嵌时的原形态)才需要这颗浮动按钮。
   */
  const showLeftPanelToggle = !isLargeScreen || !isEmbedded;

  const isVisible = (isTablet && !isPanelOpen) || isMobile;

  if (!isTablet && !isMobile) {
    return null;
  }

  return (
    <FloatingBar $align="center" withBackdrop={false}>
      {isTablet && showLeftPanelToggle && (
        <LeftPanelCollapseButton ariaLabel={t('Toggle left panel')} />
      )}
      <FadeComponent isVisible={isVisible}>
        <HeaderIcon />
      </FadeComponent>
      <FadeComponent isVisible={isVisible}>
        <DocSearchButtonModal size="small" color="neutral" withFloatingCard />
      </FadeComponent>
    </FloatingBar>
  );
};
