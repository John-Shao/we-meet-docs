import { Button, ButtonProps } from '@gouvfr-lasuite/cunningham-react';
import { t } from 'i18next';
import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

import SearchSVG from '@/assets/icons/ui-kit/zoom-rounded.svg';
import { CardFloatingBar } from '@/components/FloatingBar';
import { useDocStore } from '@/docs/doc-management';
import { useAuth } from '@/features/auth';
import { useCmdK } from '@/hooks/useCmdK';
import {
  requestHostSearch,
  useEmbedPlatform,
  useHostFeature,
} from '@/hooks/useEmbedShell';

const DocSearchModal = dynamic(
  () =>
    import('./DocSearchModal').then((mod) => ({
      default: mod.DocSearchModal,
    })),
  { ssr: false },
);

export const DocSearchButtonModal = ({
  withFloatingCard = false,
  ...props
}: ButtonProps & { withFloatingCard?: boolean }) => {
  const { currentDoc } = useDocStore();
  const { authenticated } = useAuth();
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const canSearch = authenticated || currentDoc?.abilities.search;
  // 被 we-meet 内嵌、且宿主宣告了全局搜索时,文档搜索统一收敛到宿主那一个面板
  // (对标飞书:各模块不单设搜索框)。宿主没宣告(老镜像/老 App)则一切照旧。
  const platform = useEmbedPlatform();
  const hostHasGlobalSearch = useHostFeature('global-search');

  const openSearchModal = useCallback(() => {
    const isEditorToolbarOpen =
      document.getElementsByClassName('bn-formatting-toolbar').length > 0;
    if (isEditorToolbarOpen) {
      return;
    }

    setIsSearchModalOpen(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
  }, []);

  const handleClick = useCallback(() => {
    if (hostHasGlobalSearch) {
      requestHostSearch();
      return;
    }
    openSearchModal();
  }, [hostHasGlobalSearch, openSearchModal]);

  // 收敛态下这里**不**转发 —— Ctrl+K 由 useEmbedShell 统一转发一次,两边都发会
  // 让宿主收到两条 open-search。
  const handleCmdK = useCallback(() => {
    if (hostHasGlobalSearch) {
      return;
    }
    openSearchModal();
  }, [hostHasGlobalSearch, openSearchModal]);

  useCmdK(handleCmdK);

  if (!canSearch) {
    return null;
  }

  // web 端宿主的一级 rail 上已有搜索框 + Ctrl+K 两个入口,这里不再出第二个。
  // App 端保留按钮:手机没有 Ctrl+K,只留快捷键等于把入口删了。
  if (hostHasGlobalSearch && platform === 'web') {
    return null;
  }

  const button = (
    <Button
      data-testid="search-docs-button"
      onClick={handleClick}
      size="medium"
      color="brand"
      variant="tertiary"
      aria-label={t('Search docs')}
      icon={<SearchSVG aria-hidden="true" width={24} height={24} />}
      {...props}
    />
  );

  return (
    <>
      {withFloatingCard ? <CardFloatingBar>{button}</CardFloatingBar> : button}
      {isSearchModalOpen && (
        <DocSearchModal
          onClose={closeSearchModal}
          isOpen={isSearchModalOpen}
          doc={currentDoc}
          defaultFilters="all"
        />
      )}
    </>
  );
};
