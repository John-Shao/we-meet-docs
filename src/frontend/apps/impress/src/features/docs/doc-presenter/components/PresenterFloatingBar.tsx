import { Button } from '@gouvfr-lasuite/cunningham-react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  XMark,
} from '@gouvfr-lasuite/ui-kit/icons';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box, Text } from '@/components';

interface PresenterFloatingBarProps {
  index: number;
  total: number;
  isFullscreen: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const barCss = css`
  position: fixed;
  bottom: max(var(--wm-space-xl), env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  flex-direction: row !important;
  align-items: center;
  gap: var(--wm-space-xs);
  padding: var(--wm-space-xs);
  border-radius: var(--wm-radius-card);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--wm-text-secondary);
  border: 1px solid var(--wm-border-subtle);
  background: var(--wm-surface-default);
  box-shadow: var(--wm-shadow-raised);
`;

const separatorCss = css`
  width: 1px;
  height: 1.25rem;
  background: var(--wm-border-default);
  margin: 0 0.25rem;
`;

export const PresenterFloatingBar = ({
  index,
  total,
  isFullscreen,
  onPrev,
  onNext,
  onToggleFullscreen,
  onClose,
}: PresenterFloatingBarProps) => {
  const { t } = useTranslation();
  const isFirst = index <= 0;
  const isLast = index >= total - 1;

  // Move focus into the dialog on open so keyboard users land on the
  // controls (an ARIA dialog must move focus inside itself; here on the
  // first enabled toolbar button — "Next", since "Previous" is disabled on
  // the first slide). The rAF wins the race against the dropdown's async
  // focus restoration — same pattern as ModalRemoveDoc.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      barRef.current
        ?.querySelector<HTMLButtonElement>('button:not([disabled])')
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <Box
      className="wm-presenter-controls wm-ui"
      ref={barRef}
      $direction="row"
      $align="center"
      $css={barCss}
      role="toolbar"
      aria-label={t('Presenter controls')}
    >
      <Button
        size="small"
        color="neutral"
        variant="tertiary"
        disabled={isFirst}
        onClick={onPrev}
        aria-label={t('Previous slide')}
        icon={<ChevronLeft />}
      />
      <Text as="span" $size="sm" $color="neutral" aria-hidden="true">
        {index + 1} / {total}
      </Text>
      <Button
        size="small"
        color="neutral"
        variant="tertiary"
        disabled={isLast}
        onClick={onNext}
        aria-label={t('Next slide')}
        icon={<ChevronRight />}
      />
      <Box $css={separatorCss} aria-hidden />
      <Button
        size="small"
        color="neutral"
        variant="tertiary"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? t('Exit fullscreen') : t('Enter fullscreen')}
        icon={isFullscreen ? <Minimize /> : <Maximize />}
      />
      <Button
        size="small"
        color="neutral"
        variant="tertiary"
        onClick={onClose}
        aria-label={t('Close presenter')}
        icon={<XMark />}
      />
    </Box>
  );
};
