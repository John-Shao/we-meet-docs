import { Button } from '@gouvfr-lasuite/cunningham-react';
import { useTranslation } from 'react-i18next';

import { Box } from '@/components';
import { useResponsiveStore } from '@/stores';

import LeftPanelIcon from '../assets/left-panel.svg';
import { useLeftPanelStore } from '../stores';

/**
 * 桌面端左栏收起后的**窄条 + 展开按钮**(2026-09-18)。
 *
 * 与 we-meet 宿主其它模块的 SubNavStrip 同一形态:36px 宽、上内边距 12px、
 * 1px 右分割线、一颗 16px 图标的展开按钮。宿主那边的定义见
 * we-meet/src/frontend/src/components/SubNav.tsx。
 *
 * 只在桌面(large screen)渲染:平板/手机是抽屉 + 浮动条那套,别动它们。
 */
export const LeftPanelStrip = () => {
  const { t } = useTranslation();
  const { openPanel } = useLeftPanelStore();
  const { isLargeScreen } = useResponsiveStore();

  if (!isLargeScreen) {
    return null;
  }

  return (
    <Box className="wm-subnav-strip" as="div" data-testid="left-panel-strip">
      <Button
        size="small"
        color="neutral"
        variant="tertiary"
        onClick={() => openPanel()}
        aria-label={t('Toggle left panel')}
        title={t('Toggle left panel')}
        icon={<LeftPanelIcon width={16} height={16} aria-hidden="true" />}
        data-testid="left-panel-strip-expand"
      />
    </Box>
  );
};
