import { RefObject, useEffect } from 'react';

import { DropdownMenuOption } from '../DropdownMenu';

type UseDropdownKeyboardNavProps = {
  isOpen: boolean;
  focusedIndex: number;
  options: DropdownMenuOption[];
  menuItemRefs: RefObject<(HTMLButtonElement | null)[]>;
  setFocusedIndex: (index: number) => void;
  onOpenChange: (isOpen: boolean) => void;
};

export const useDropdownKeyboardNav = ({
  isOpen,
  focusedIndex,
  options,
  menuItemRefs,
  setFocusedIndex,
  onOpenChange,
}: UseDropdownKeyboardNavProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) {
        return;
      }

      const enabledIndices = options
        .map((option, index) =>
          option.show !== false && !option.disabled ? index : -1,
        )
        .filter((index) => index !== -1);
      const position = enabledIndices.indexOf(focusedIndex);

      const focusItem = (index: number | undefined) => {
        if (index !== undefined) {
          setFocusedIndex(index);
          menuItemRefs.current[index]?.focus();
        }
      };

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          focusItem(enabledIndices[(position + 1) % enabledIndices.length]);
          break;
        }

        case 'ArrowUp': {
          event.preventDefault();
          focusItem(
            enabledIndices[
              position > 0 ? position - 1 : enabledIndices.length - 1
            ],
          );
          break;
        }

        case 'Home':
          event.preventDefault();
          focusItem(enabledIndices[0]);
          break;

        case 'End':
          event.preventDefault();
          focusItem(enabledIndices.at(-1));
          break;

        case 'Enter':
        case ' ': {
          event.preventDefault();
          if (position !== -1) {
            const selectedOption = options[focusedIndex];
            if (selectedOption && selectedOption.callback) {
              onOpenChange(false);
              void selectedOption.callback();
            }
          }
          break;
        }

        case 'Escape':
          event.preventDefault();
          onOpenChange(false);
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isOpen,
    focusedIndex,
    options,
    menuItemRefs,
    setFocusedIndex,
    onOpenChange,
  ]);
};
