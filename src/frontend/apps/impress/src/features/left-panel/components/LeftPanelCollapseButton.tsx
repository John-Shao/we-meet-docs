import { Button } from '@gouvfr-lasuite/cunningham-react';

import { Text } from '@/components';
import { FadeComponent } from '@/components/Effect';
import { CardFloatingBar } from '@/components/FloatingBar';
import { useResponsiveStore } from '@/stores';

import DoubleArrowLeftIcon from '../assets/double-arrow-left.svg';
import DoubleArrowRightIcon from '../assets/double-arrow-right.svg';
import { useLeftPanelStore } from '../stores';

export const LeftPanelCollapseButton = ({
  ariaLabel,
  buttonTitle,
}: {
  ariaLabel: string;
  buttonTitle?: string;
}) => {
  const { isPanelOpen, togglePanel } = useLeftPanelStore();
  const { isSmallMobile } = useResponsiveStore();

  return (
    <CardFloatingBar className="--docs--left-panel-collapse-button">
      <Button
        size="small"
        onClick={() => togglePanel()}
        aria-label={ariaLabel}
        aria-expanded={isPanelOpen}
        color="neutral"
        variant="tertiary"
        /*
          图标与栏头的收起按钮同族镜像:展开 `»`、收起 `«` —— 同一个控件两个状态只反
          方向。双箭头这一族专属二级导航栏(宿主一级轨道用面板图形)。
        */
        icon={
          isPanelOpen ? (
            <DoubleArrowLeftIcon width={24} height={24} aria-hidden="true" />
          ) : (
            <DoubleArrowRightIcon width={24} height={24} aria-hidden="true" />
          )
        }
        data-testid="floating-bar-toggle-left-panel"
      >
        {!isSmallMobile && !!buttonTitle && (
          <FadeComponent isVisible={!!buttonTitle}>
            <Text
              $size="sm"
              $weight={700}
              $color="var(--c--globals--colors--gray-1000)"
              title={buttonTitle}
            >
              {buttonTitle}
            </Text>
          </FadeComponent>
        )}
      </Button>
    </CardFloatingBar>
  );
};
