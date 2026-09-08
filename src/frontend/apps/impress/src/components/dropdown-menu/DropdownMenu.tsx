import {
  Fragment,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { css } from 'styled-components';

import {
  Box,
  BoxButton,
  BoxProps,
  DropButton,
  HorizontalSeparator,
  Icon,
  Text,
} from '@/components';
import { useCunninghamTheme } from '@/cunningham';
import { useKeyboardAction } from '@/hooks';

import { useDropdownKeyboardNav } from './hook/useDropdownKeyboardNav';

export type DropdownMenuOption = {
  icon?: ReactNode;
  label: string;
  lang?: string;
  testId?: string;
  value?: string;
  callback?: () => void | Promise<unknown>;
  danger?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  show?: boolean;
  showSeparator?: boolean;
};

export type DropdownMenuProps = {
  options: DropdownMenuOption[];
  showArrow?: boolean;
  label?: string;
  arrowCss?: BoxProps['$css'];
  buttonCss?: BoxProps['$css'];
  disabled?: boolean;
  opened?: boolean;
  topMessage?: string;
  selectedValues?: string[];
  afterOpenChange?: (isOpen: boolean) => void;
  testId?: string;
};

export const DropdownMenu = ({
  options,
  children,
  disabled = false,
  showArrow = false,
  arrowCss,
  buttonCss,
  label,
  opened,
  topMessage,
  afterOpenChange,
  selectedValues,
  testId,
}: PropsWithChildren<DropdownMenuProps>) => {
  const { spacingsTokens } = useCunninghamTheme();
  const keyboardAction = useKeyboardAction();
  const [isOpen, setIsOpen] = useState(opened ?? false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const blockButtonRef = useRef<HTMLDivElement>(null);
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isSingleSelectable = options.some(
    (option) => option.isSelected !== undefined,
  );

  const onOpenChange = useCallback(
    (isOpen: boolean) => {
      setIsOpen(isOpen);
      setFocusedIndex(-1);
      afterOpenChange?.(isOpen);
    },
    [afterOpenChange],
  );

  useDropdownKeyboardNav({
    isOpen,
    focusedIndex,
    options,
    menuItemRefs,
    setFocusedIndex,
    onOpenChange,
  });

  // Focus selected menu item when menu opens
  useEffect(() => {
    if (isOpen && menuItemRefs.current.length > 0) {
      const selectedIndex = options.findIndex((option) => option.isSelected);
      if (selectedIndex !== -1) {
        setFocusedIndex(selectedIndex);
        setTimeout(() => {
          menuItemRefs.current[selectedIndex]?.focus();
        }, 0);
      }
    }
  }, [isOpen, options]);

  const triggerOption = useCallback(
    (option: DropdownMenuOption) => {
      onOpenChange?.(false);
      void option.callback?.();
    },
    [onOpenChange],
  );

  if (disabled) {
    return children;
  }

  return (
    <DropButton
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      label={label}
      buttonCss={buttonCss}
      testId={testId}
      button={
        showArrow ? (
          <Box
            ref={blockButtonRef}
            $direction="row"
            $align="center"
            $position="relative"
          >
            <Box>{children}</Box>
            <Icon
              $css={
                arrowCss ??
                css`
                  color: var(--wm-text-link);
                `
              }
              iconName={isOpen ? 'arrow_drop_up' : 'arrow_drop_down'}
            />
          </Box>
        ) : (
          <Box ref={blockButtonRef} $color="inherit">
            {children}
          </Box>
        )
      }
    >
      <Box
        $maxWidth="320px"
        $minWidth={`${blockButtonRef.current?.clientWidth}px`}
        className="wm-menu"
        role="menu"
        aria-label={label}
      >
        {topMessage && (
          <Text
            $wrap="wrap"
            $size="xs"
            $weight="bold"
            $padding={{ vertical: 'xs', horizontal: 'base' }}
            $css={css`
              white-space: pre-line;
            `}
          >
            {topMessage}
          </Text>
        )}
        {options.map((option, index) => {
          if (option.show !== undefined && !option.show) {
            return;
          }
          const isDisabled = option.disabled !== undefined && option.disabled;
          const isSelected =
            option.isSelected === true ||
            (selectedValues?.includes(option.value ?? '') ?? false);
          const itemRole =
            selectedValues !== undefined
              ? 'menuitemcheckbox'
              : isSingleSelectable
                ? 'menuitemradio'
                : 'menuitem';
          const optionKey = option.value ?? option.testId ?? `option-${index}`;

          return (
            <Fragment key={optionKey}>
              <BoxButton
                ref={(el) => {
                  menuItemRefs.current[index] = el;
                }}
                className="wm-menu-item"
                data-danger={option.danger || undefined}
                role={itemRole}
                aria-checked={itemRole === 'menuitem' ? undefined : isSelected}
                data-testid={option.testId}
                $direction="row"
                disabled={isDisabled}
                $hasTransition={false}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  triggerOption(option);
                }}
                onKeyDown={keyboardAction(() => triggerOption(option))}
                $align="center"
                $justify="space-between"
                $background="var(--c--contextuals--background--surface--primary)"
                $color="var(--wm-text-primary)"
                $padding={{ vertical: 'xs', horizontal: 'base' }}
                $width="100%"
                $gap={spacingsTokens['base']}
                $css={css`
                  border: none;
                  cursor: ${isDisabled ? 'default' : 'pointer'};
                  user-select: none;
                `}
              >
                <Box
                  $direction="row"
                  $align="center"
                  $gap={spacingsTokens['base']}
                >
                  {option.icon && typeof option.icon === 'string' && (
                    <Icon
                      className="wm-menu-icon"
                      $size="20px"
                      $theme="neutral"
                      $variation={isDisabled ? 'tertiary' : 'primary'}
                      iconName={option.icon}
                      aria-hidden="true"
                    />
                  )}

                  {option.icon && typeof option.icon !== 'string' && (
                    <Box
                      className="wm-menu-icon"
                      $theme="neutral"
                      $variation={isDisabled ? 'tertiary' : 'primary'}
                    >
                      {option.icon}
                    </Box>
                  )}
                  <Text
                    className="wm-menu-label"
                    $variation={isDisabled ? 'tertiary' : 'primary'}
                  >
                    <span lang={option.lang}>{option.label}</span>
                  </Text>
                </Box>
                {isSelected && (
                  <Icon
                    iconName="check"
                    $size="20px"
                    $theme="gray"
                    aria-hidden="true"
                  />
                )}
              </BoxButton>
              {option.showSeparator && <HorizontalSeparator $margin="none" />}
            </Fragment>
          );
        })}
      </Box>
    </DropButton>
  );
};
