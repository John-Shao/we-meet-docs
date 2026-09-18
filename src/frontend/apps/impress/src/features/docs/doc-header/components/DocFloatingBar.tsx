import { Box } from '@/components';
import { CardFloatingBar, FloatingBar } from '@/components/FloatingBar';
import { useDocStore } from '@/docs/doc-management/stores/useDocStore';
import { DocShareButton } from '@/features/docs/doc-share/components/DocShareButton';
import { useLeftPanelStore } from '@/features/left-panel/stores/useLeftPanelStore';
import { RightPanelCollapseButton } from '@/features/right-panel/components/RightPanelCollapseButton';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { DocLeftPanelCollapseButton } from './DocLeftPanelCollapseButton';
import { DocToolBox } from './DocToolBox';

export const DocFloatingBar = () => {
  const { currentDoc } = useDocStore();
  const { isMobile } = useResponsiveStore();
  const { isPanelOpen } = useLeftPanelStore();
  const isDeletedDoc = !!currentDoc?.deleted_at;

  /**
   * 左栏收起后**只有**这颗浮动按钮担展开入口(不再有 36px 窄条占宽度);面板展开时
   * 收起按钮在二级导航栏栏头里,这里不重复给。窄屏(抽屉)开着时它也是关抽屉的入口。
   */
  const showLeftPanelToggle = !isPanelOpen || isMobile;

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
