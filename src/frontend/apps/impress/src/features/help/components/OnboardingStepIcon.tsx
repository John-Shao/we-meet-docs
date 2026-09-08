import { CSSProperties, PropsWithChildren } from 'react';
import { css } from 'styled-components';

import { Box } from '@/components';
import { tokens, useCunninghamTheme } from '@/cunningham';

type ColorToken = keyof typeof tokens.themes.default.globals.colors;

export interface OnboardingStepIconProps {
  size?: string;
  colorToken?: ColorToken;
  color?: CSSProperties['color'];
}

export const OnboardingStepIcon = ({
  size = 'var(--wm-control-height-compact)',
  colorToken,
  color: colorCss,
  children,
}: PropsWithChildren<OnboardingStepIconProps>) => {
  const { colorsTokens } = useCunninghamTheme();
  const color =
    colorCss ??
    (colorToken ? colorsTokens[colorToken] : undefined) ??
    'var(--wm-icon-secondary)';

  return (
    <Box
      $css={css`
        width: ${size};
        height: ${size};
        flex: 0 0 ${size};
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${color};

        svg {
          width: var(--wm-icon-medium);
          height: var(--wm-icon-medium);
          display: block;
        }
      `}
    >
      {children}
    </Box>
  );
};
