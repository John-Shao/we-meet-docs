import { PropsWithChildren } from 'react';
import { css } from 'styled-components';

import { Box, BoxType } from './Box';
import { Card } from './Card';

const FLOATING_STYLES = css`
  position: sticky;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  z-index: 10; // Under editor select box but above other elements (e.g., doc title, suggestion menu)
  isolation: isolate;
  min-height: 68px;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    /* 渐变起点要**不透明**面色(原值 #fff):这条是把顶部滚动内容淡出的遮罩。
       别用 background--semantic--contextual--primary —— 那是 5% alpha 的叠加色,
       淡出效果基本消失,内容会直接怼到浮动条底下。 */
    background: linear-gradient(
      180deg,
      var(--c--contextuals--background--surface--primary, #fff) 0%,
      transparent 100%
    );
    backdrop-filter: blur(1px);
    -webkit-backdrop-filter: blur(1px);
    mask-image: linear-gradient(180deg, black 50%, transparent 100%);
    -webkit-mask-image: linear-gradient(180deg, black 50%, transparent 100%);
  }

  > * {
    position: relative;
    z-index: 1;
  }
`;

export const FloatingBar = ({
  children,
  ...props
}: PropsWithChildren<BoxType>) => {
  return (
    <Box
      as="header"
      className="--docs--floating-bar"
      data-testid="floating-bar"
      $direction="row"
      $justify="space-between"
      $align="flex-start"
      $padding="sm"
      $css={FLOATING_STYLES}
      {...props}
    >
      {children}
    </Box>
  );
};

export const CardFloatingBar = ({
  children,
  ...props
}: PropsWithChildren<BoxType>) => {
  return (
    <Card
      className="--docs--card-floating-bar"
      $direction="row"
      $css={css`
        padding: var(--c--globals--spacings--xxxs);
        align-items: center;
        gap: var(--c--globals--spacings--xxxs);
        border-radius: var(--wm-radius-card);
        box-shadow: var(--wm-shadow-raised);
      `}
      {...props}
    >
      {children}
    </Card>
  );
};
