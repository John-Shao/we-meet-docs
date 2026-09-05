import {
  PropsWithChildren,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button, Popover } from 'react-aria-components';
import styled, { css } from 'styled-components';

import { useCunninghamTheme } from '@/cunningham';
import { useFocusStore } from '@/stores';

import { BoxProps } from './Box';

const StyledPopover = styled(Popover)`
  background-color: var(--c--contextuals--background--surface--primary);
  border-radius: var(--wm-radius-card);
  box-shadow: var(--wm-shadow-overlay);
  border: 1px solid var(--c--contextuals--border--surface--primary);
  transition: opacity var(--c--globals--transitions--duration)
    var(--c--globals--transitions--ease-out);
`;

interface StyledButtonProps {
  $css?: BoxProps['$css'];
}
const StyledButton = styled(Button)<StyledButtonProps>`
  cursor: pointer;
  border: none;
  background: none;
  outline: none;
  font-weight: var(--c--components--button--font-weight);
  font-size: var(--c--components--button--medium-font-size);
  padding: var(--c--globals--spacings--0);
  border-radius: var(--wm-radius-control);
  color: var(--c--contextuals--content--semantic--brand--tertiary);
  &:hover {
    background-color: var(
      --c--contextuals--background--semantic--contextual--primary
    );
  }
  &:focus-visible {
    box-shadow: 0 0 0 2px var(--c--globals--colors--brand-400);
    background-color: var(
      --c--contextuals--background--semantic--brand--tertiary-hover
    );
    border-radius: var(--wm-radius-control);
  }
  ${({ $css }) => $css};
`;

export interface DropButtonProps {
  button: ReactNode;
  buttonCss?: BoxProps['$css'];
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  label?: string;
  testId?: string;
}

export const DropButton = ({
  button,
  buttonCss,
  isOpen = false,
  onOpenChange,
  children,
  label,
  testId,
}: PropsWithChildren<DropButtonProps>) => {
  const { themeTokens } = useCunninghamTheme();
  const font = themeTokens['font']?.['families']['base'];
  const [isLocalOpen, setIsLocalOpen] = useState(isOpen);
  const addLastFocus = useFocusStore((state) => state.addLastFocus);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setIsLocalOpen(isOpen);
  }, [isOpen]);

  const onOpenChangeHandler = (isOpen: boolean) => {
    setIsLocalOpen(isOpen);
    onOpenChange?.(isOpen);
  };

  return (
    <>
      <StyledButton
        ref={triggerRef}
        onPress={() => {
          addLastFocus(triggerRef.current);
          onOpenChangeHandler(true);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isLocalOpen}
        data-testid={testId}
        $css={css`
          font-family: ${font};
          ${buttonCss};
        `}
        className="--docs--drop-button"
      >
        {button}
      </StyledButton>

      <StyledPopover
        triggerRef={triggerRef}
        isOpen={isLocalOpen}
        onOpenChange={onOpenChangeHandler}
        className="--docs--drop-button-popover"
      >
        {children}
      </StyledPopover>
    </>
  );
};
