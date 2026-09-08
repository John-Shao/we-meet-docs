import { RuleSet, css } from 'styled-components';

import { Icon } from '@/components';

import IconAIBase from '../../assets/IconAI.svg';
import IconAILoading from '../../assets/ai-loader.svg';

interface IconAIProps {
  isError?: boolean;
  isHighlighted?: boolean;
  isLoading?: boolean;
  width: string;
  $css?: string | RuleSet<object>;
}

export const IconAI = ({
  isError,
  isHighlighted,
  isLoading,
  width,
  $css,
}: IconAIProps) => {
  if (isError) {
    return (
      <Icon
        $theme="error"
        $variation="secondary"
        icon={<Icon iconName="error" $withThemeInherited $size={width} />}
      />
    );
  }

  if (isLoading) {
    return (
      <Icon
        $theme="brand"
        $variation="tertiary"
        $css={css`
          animation: spin 5s linear infinite;
          @keyframes spin {
            0% {
              transform: rotate(360deg);
            }
            100% {
              transform: rotate(0deg);
            }
          }
          ${$css}
        `}
        $padding="0.15rem"
        $width={width}
        icon={<IconAILoading />}
      />
    );
  }

  return (
    <Icon
      $css={css`
        border: 1px solid var(--wm-border-subtle);
        color: var(--wm-icon-secondary);
        transition: all 0.1s ease-in;
        box-shadow: var(--wm-shadow-raised);
        ${isHighlighted &&
        css`
          background-color: var(--wm-action-primary-background);
          border: 1px solid var(--wm-border-focus);
          color: var(--wm-action-primary-foreground);
          box-shadow: var(--wm-shadow-raised);
        `}
        ${$css}
      `}
      $radius="100%"
      $padding="0.15rem"
      $width={width}
      icon={<IconAIBase />}
    />
  );
};
