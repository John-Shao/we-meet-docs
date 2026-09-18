import { useTranslation } from 'react-i18next';

import { FadeComponent } from '@/components/Effect';
import { FloatingBar } from '@/components/FloatingBar';
import { DocSearchButtonModal } from '@/features/docs/doc-search/components/DocSearchButtonModal';
import { LeftPanelCollapseButton } from '@/features/left-panel/components/LeftPanelCollapseButton';
import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { HeaderIcon } from './HeaderIcon';

export const HeaderFloatingBar = () => {
  const { isMobile, isTablet } = useResponsiveStore();
  const { t } = useTranslation();
  const { isPanelOpen } = useLeftPanelStore();

  /**
   * 左栏收起后**只有**这颗浮动按钮担展开入口(不再有 36px 窄条占宽度),所以桌面收起时
   * 也要渲染它;面板展开时收起按钮在二级导航栏栏头里,这里不重复给。
   * 窄屏(抽屉)那一档例外:抽屉开着时这颗按钮也是关抽屉的入口,一直留着。
   */
  const showLeftPanelToggle = !isPanelOpen || isMobile;
  const isNarrowLayout = isTablet || isMobile;
  const isVisible = (isTablet && !isPanelOpen) || isMobile;

  if (!isNarrowLayout) {
    // 桌面:收起态给一颗浮动展开按钮;面板开着时这条顶栏完全不必存在。
    if (!showLeftPanelToggle) {
      return null;
    }

    return (
      <FloatingBar $align="center" withBackdrop={false}>
        <LeftPanelCollapseButton ariaLabel={t('Toggle left panel')} />
      </FloatingBar>
    );
  }

  return (
    <FloatingBar $align="center" withBackdrop={false}>
      {showLeftPanelToggle && (
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
