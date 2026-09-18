import { Box } from '@/components';
import { CardFloatingBar, FloatingBar } from '@/components/FloatingBar';
import { useDocStore } from '@/docs/doc-management/stores/useDocStore';
import { DocShareButton } from '@/features/docs/doc-share/components/DocShareButton';
import { RightPanelCollapseButton } from '@/features/right-panel/components/RightPanelCollapseButton';
import { useEmbedPlatform } from '@/hooks/useEmbedShell';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { DocLeftPanelCollapseButton } from './DocLeftPanelCollapseButton';
import { DocToolBox } from './DocToolBox';

export const DocFloatingBar = () => {
  const { currentDoc } = useDocStore();
  const { isLargeScreen } = useResponsiveStore();
  const isEmbedded = useEmbedPlatform() !== null;
  const isDeletedDoc = !!currentDoc?.deleted_at;

  /**
   * 大屏内嵌时左栏入口在二级导航栏栏头(展开时)与 36px 窄条(收起时)里,
   * 浮动条不再重复给一个;抽屉那一档(窄屏 / 未内嵌)才需要它。
   */
  const showLeftPanelToggle = !isLargeScreen || !isEmbedded;

  return (
    <FloatingBar>
      {showLeftPanelToggle && <DocLeftPanelCollapseButton />}
      <Box $direction="row" $align="center" $gap="2xs">
        {!isDeletedDoc && currentDoc && <DocShareButton doc={currentDoc} />}
        <CardFloatingBar>
          <RightPanelCollapseButton />
          {!isDeletedDoc && currentDoc && <DocToolBox doc={currentDoc} />}
        </CardFloatingBar>
      </Box>
    </FloatingBar>
  );
};
