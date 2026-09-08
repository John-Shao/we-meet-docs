import { css } from 'styled-components';

import { Box, Text } from '@/components';
import { DocsBlockNoteEditor } from '@/docs/doc-editor/types';
import { getMainContentElement } from '@/layouts/utils';
import { useResponsiveStore } from '@/stores';

const SCROLL_MARGIN_TOP = 50;

export type HeadingsHighlight = {
  headingId: string;
  isVisible: boolean;
}[];

interface HeadingProps {
  editor: DocsBlockNoteEditor;
  level: number;
  text: string;
  headingId: string;
  isHighlight: boolean;
}

export const Heading = ({
  headingId,
  editor,
  isHighlight,
  level,
  text,
}: HeadingProps) => {
  const { isMobile } = useResponsiveStore();

  return (
    <Box
      as="a"
      href={`#${headingId}`}
      className="--docs--table-content-heading"
      $width="100%"
      $minHeight="var(--c--globals--spacings--lg)"
      onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
        // With mobile the focus open the keyboard and the scroll is not working
        e.preventDefault();

        if (!isMobile) {
          editor.focus();
        }

        editor.setTextCursorPosition(headingId, 'end');

        const blockEl = document.getElementById(headingId);

        // Try to scroll the main content container instead of the block itself
        // to avoid the block being hidden behind the header
        const container = getMainContentElement();

        if (blockEl && container) {
          const top =
            blockEl.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop -
            SCROLL_MARGIN_TOP;

          container.scrollTo({ top, behavior: 'smooth' });
        } else {
          blockEl?.scrollIntoView({
            behavior: 'smooth',
            inline: 'start',
            block: 'start',
          });
        }
      }}
      $radius="var(--c--globals--spacings--st)"
      $background={isHighlight ? 'var(--wm-action-selected-container)' : 'none'}
      $justify="center"
      $padding="none"
      $margin="none"
      $hasTransition
      $css={css`
        text-align: left;
        display: flex;
        text-decoration: none;
        padding-inline-start: calc(
          var(--wm-space-sm) + ${Math.max(0, Math.min(level, 6) - 1)} *
            var(--wm-space-md)
        );
        color: ${isHighlight
          ? 'var(--wm-action-selected-on-container)'
          : 'var(--wm-text-primary)'};
        &:hover {
          background: var(--wm-surface-muted);
        }
        &[aria-current]:hover {
          background: var(--wm-action-selected-container);
        }
        cursor: pointer;
        &:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--wm-border-focus);
          border-radius: var(--c--globals--spacings--st);
        }
      `}
      aria-current={isHighlight ? 'true' : undefined}
    >
      <Text
        $size="sm"
        $weight={isHighlight ? '500' : '400'}
        $withThemeInherited
        $css="overflow-wrap: break-word;"
        $hasTransition
      >
        {text}
      </Text>
    </Box>
  );
};
