import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box } from '@/components';
import { useResponsiveStore } from '@/stores/useResponsiveStore';

import { useLeftPanelStore } from '../stores';

import { LeftPanelContent } from './LeftPanelContent';
import { LeftPanelFooter } from './LeftPanelFooter';
import { LeftPanelHeader } from './LeftPanelHeader';

export const LeftPanel = ({ isResizable }: { isResizable?: boolean }) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveStore();
  const { isPanelOpen, closePanel } = useLeftPanelStore();

  return (
    <>
      {isMobile && (
        <Box
          $css={css`
            position: fixed;
            inset: 0;
            z-index: 999;
            background-color: rgba(0, 0, 0, 0.3);
            transition: opacity 0.2s ease-in-out;
            opacity: ${isPanelOpen ? 1 : 0};
            pointer-events: ${isPanelOpen ? 'auto' : 'none'};
          `}
          onClick={closePanel}
        />
      )}
      <Box
        as="nav"
        className="--docs--left-panel wm-ui"
        data-testid="left-panel"
        aria-label={t('Left panel')}
        $width={
          isResizable
            ? '100%'
            : isMobile
              ? 'min(300px, calc(100vw - 48px))'
              : '300px'
        }
        $css={css`
          height: 100dvh;
          overflow: hidden;
          background-color: var(--c--contextuals--background--surface--primary);
          transition:
            transform 0.2s ease-in-out,
            width 0.2s ease-in-out;

          ${!isResizable
            ? css`
                border-right: 1px solid
                  var(--c--contextuals--border--surface--primary);
              `
            : ''}

          /*
            收起态把整栏让出去(不再有 36px 窄条占宽):可拖宽那一档由 react-resizable-panels
            自己收成 0,其余非手机档(列表页桌面 / 平板)在这里收成 0。
            展开入口由浮动【导航栏】按钮担(见 HeaderFloatingBar / DocFloatingBar)。
          */
          ${!isMobile && !isResizable
            ? css`
                ${!isPanelOpen
                  ? css`
                      transform: translateX(-100%);
                      width: 0;
                    `
                  : ''}
              `
            : ''}

          ${isMobile
            ? css`
                position: fixed;
                z-index: 1000;
                top: 0;
                left: 0;
                ${!isPanelOpen
                  ? css`
                      transform: translateX(-100%);
                      width: 0;
                    `
                  : ''}
              `
            : ''}
        `}
      >
        <Box
          $css={css`
            flex: 0 0 auto;
          `}
        >
          <LeftPanelHeader />
        </Box>
        <LeftPanelContent />
        <LeftPanelFooter />
      </Box>
    </>
  );
};
