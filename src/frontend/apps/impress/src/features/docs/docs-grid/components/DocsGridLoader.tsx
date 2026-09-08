import { Loader } from '@gouvfr-lasuite/cunningham-react';
import { useTranslation } from 'react-i18next';
import { css } from 'styled-components';

import { Box } from '@/components';

type DocsGridLoaderProps = {
  isLoading: boolean;
};

export const DocsGridLoader = ({ isLoading }: DocsGridLoaderProps) => {
  const { t } = useTranslation();
  if (!isLoading) {
    return null;
  }

  return (
    <>
      <Box
        data-testid="grid-loader"
        role="status"
        aria-label={t('Loading…')}
        $align="center"
        $justify="center"
        $height="100%"
        $width="100%"
        /* 半透明遮罩:必须基于**不透明**面色再取 50%(原值 rgba(255,255,255,.5))。
           曾误用 background--semantic--contextual--primary —— 它本身就是 5% alpha,
           再乘 50% 只剩 2.5%,遮罩形同虚设。 */
        $background="color-mix(in srgb, var(--c--contextuals--background--surface--primary) 50%, transparent)"
        $zIndex={998}
        $position="absolute"
        className="--docs--doc-grid-loader"
        $css={css`
          inset: 0;
          pointer-events: none;
        `}
      >
        <Loader />
      </Box>
    </>
  );
};
