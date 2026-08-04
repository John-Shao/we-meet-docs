import { Button } from '@gouvfr-lasuite/cunningham-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InView } from 'react-intersection-observer';
import { css } from 'styled-components';

import AllDocs from '@/assets/icons/doc-all.svg';
import { Box, Card, Icon, Text } from '@/components';
import { useInfiniteDocs } from '@/docs/doc-management/api/useDocs';
import { useImport } from '@/docs/doc-management/hooks/useImport';
import { DocDefaultFilter } from '@/docs/doc-management/types';
import { DocShareModalHost } from '@/docs/doc-share';
import { useResponsiveStore } from '@/stores';

import { useInfiniteDocsTrashbin } from '../api';
import { useResponsiveDocGrid } from '../hooks/useResponsiveDocGrid';

import { DocGridContentList } from './DocGridContentList';
import { DocsGridLoader } from './DocsGridLoader';

type DocsGridProps = {
  target?: DocDefaultFilter;
};

export const DocsGrid = ({
  target = DocDefaultFilter.ALL_DOCS,
}: DocsGridProps) => {
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    getRootProps,
    isPending: isImportPending,
    isEnabled: isImportEnabled,
  } = useImport({
    onDragOver: (dragOver: boolean) => {
      setIsDragOver(dragOver);
    },
  });

  const withUpload =
    (!target ||
      target === DocDefaultFilter.ALL_DOCS ||
      target === DocDefaultFilter.MY_DOCS) &&
    isImportEnabled;

  const { isDesktop } = useResponsiveStore();
  const { flexLeft, flexRight } = useResponsiveDocGrid();

  const {
    data,
    isFetching,
    isFetchingNextPage,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = useDocsQuery(target);

  const docs = useMemo(() => {
    const allDocs = data?.pages.flatMap((page) => page.results) ?? [];
    // Deduplicate documents by ID to prevent the same doc appearing multiple times
    // This can happen when a multiple users are impacting the docs list (creation, update, ...)
    const seenIds = new Set<string>();
    return allDocs.filter((doc) => {
      if (seenIds.has(doc.id)) {
        return false;
      }
      seenIds.add(doc.id);
      return true;
    });
  }, [data?.pages]);

  const loading = isFetching || isLoading;
  /**
   * 遮罩只给「屏幕上还没有内容」的等待用。它是盖满列表的半透明层 + 锁滚动,
   * 挂在 `isFetching` 上的话,LIVE_LIST_REFETCH 的每次后台重取(30s 轮询、
   * 切回前台)都会闪一次转圈并抢走滚动 —— 静默更新的意义就没了。
   */
  const showOverlay = isLoading || isImportPending;
  const hasDocs = data?.pages.some((page) => page.results.length > 0);
  const loadMore = (inView: boolean) => {
    if (!inView || loading) {
      return;
    }
    void fetchNextPage();
  };

  return (
    <Box
      className="--docs--doc-grid"
      $position="relative"
      $padding={{ horizontal: 'sm' }}
      $width="100%"
      $maxWidth="960px"
      $minHeight="0"
      $align="center"
    >
      <DocsGridLoader isLoading={showOverlay} />
      {/* 分享弹窗挂在列表**之上**:下面的列表会因查询失效整体卸载(hasDocs
          转 false),挂在行里的弹窗会被一起带走。见 useDocShareModalStore。 */}
      <DocShareModalHost />
      <Card
        data-testid="docs-grid"
        $width="100%"
        $css={css`
          border: 1px solid var(--c--contextuals--border--surface--primary);
          ${isDragOver
            ? `
              border: 2px dashed var(--c--contextuals--border--semantic--brand--primary);
              background-color: var(--c--contextuals--background--semantic--brand--tertiary);
            `
            : ''}
        `}
        $padding={{
          bottom: 'md',
        }}
        {...(withUpload
          ? getRootProps({ className: 'dropzone', tabIndex: -1 })
          : {})}
      >
        <DocGridTitleBar target={target} />
        {!hasDocs && !showOverlay && (
          <Box $padding={{ vertical: 'sm' }} $align="center" $justify="center">
            <Text $size="sm" $weight="700">
              {t('No documents found')}
            </Text>
          </Box>
        )}
        {hasDocs && (
          <Box
            $gap="6px"
            $padding={{ vertical: 'sm', horizontal: isDesktop ? 'md' : 'xs' }}
          >
            <Box aria-label={t('Documents grid')}>
              <Box
                $direction="row"
                $padding={{ horizontal: 'xs' }}
                $gap="10px"
                data-testid="docs-grid-header"
                aria-hidden="true"
              >
                <Box $flex={flexLeft} $padding="3xs">
                  <Text $size="xs" $variation="secondary" $weight="500">
                    {t('Name')}
                  </Text>
                </Box>
                {isDesktop && (
                  <Box $flex={flexRight} $padding={{ vertical: '3xs' }}>
                    <Text $size="xs" $weight="500" $variation="secondary">
                      {DocDefaultFilter.TRASHBIN === target
                        ? t('Days remaining')
                        : t('Updated at')}
                    </Text>
                  </Box>
                )}
              </Box>
              <Box role="list">
                <DocGridContentList docs={docs} />
              </Box>
            </Box>
            {/* 「加载更多」的显隐只看「是否正在取下一页」:挂在 isFetching 上会被
                30s 的后台重取每次抹掉一瞬。 */}
            {hasNextPage && !isFetchingNextPage && (
              <InView
                data-testid="infinite-scroll-trigger"
                as="div"
                onChange={loadMore}
              >
                {!isFetchingNextPage && hasNextPage && (
                  <Button
                    onClick={() => void fetchNextPage()}
                    color="brand"
                    variant="tertiary"
                  >
                    {t('More docs')}
                  </Button>
                )}
              </InView>
            )}
          </Box>
        )}
      </Card>
    </Box>
  );
};

const DocGridTitleBar = ({ target }: { target: DocDefaultFilter }) => {
  const { t } = useTranslation();
  const { isDesktop } = useResponsiveStore();

  let title = t('All docs');
  let icon = <Icon icon={<AllDocs width={24} height={24} />} />;
  if (target === DocDefaultFilter.MY_DOCS) {
    icon = <Icon iconName="lock" />;
    title = t('My docs');
  } else if (target === DocDefaultFilter.SHARED_WITH_ME) {
    icon = <Icon iconName="group" />;
    title = t('Shared with me');
  } else if (target === DocDefaultFilter.TRASHBIN) {
    icon = <Icon iconName="delete" />;
    title = t('Trashbin');
  }

  return (
    <Box
      $direction="row"
      $padding={{
        vertical: 'sm',
        horizontal: isDesktop ? 'md' : 'xs',
      }}
      $css={css`
        border-bottom: 1px solid var(--c--contextuals--border--surface--primary);
      `}
      $align="center"
      $justify="space-between"
    >
      <Box $direction="row" $gap="xs" $align="center">
        {icon}
        <Text as="h2" $size="h4" $margin="none" tabIndex={-1}>
          {title}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * 文档列表是**随时被别人改动**的数据(他人分享给我、协作者改标题、被移走),
 * 不能按全局 staleTime(3 分钟,见 AppProvider)那样当静态数据缓存 ——
 * 别人分享过来后要等最多 3 分钟才出现,用户看到的是「分享没生效」。
 *
 * 三条一起才盖得全,少一条就留死角:
 * - `refetchOnMount: 'always'`:在左栏几个筛选间切来切去时(每个 target 是**独立
 *   query key**,各自计各自的 staleTime),回到某个列表必重取;
 * - `refetchOnWindowFocus: 'always'`:App 切走再切回来 / 网页换标签页时重取;
 * - `refetchInterval`:停在列表页**干等**时的兜底 —— 前两条都要有交互才触发,
 *   而这正是用户等分享出现时的姿势。后台不轮询,不烧息屏时的流量。
 *
 * 都是后台重取:先渲染缓存再更新,不闪白、不回到骨架屏。
 */
const LIVE_LIST_REFETCH = {
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchInterval: 30 * 1000,
  refetchIntervalInBackground: false,
} as const;

const useDocsQuery = (target: DocDefaultFilter) => {
  const trashbinQuery = useInfiniteDocsTrashbin(
    {
      page: 1,
    },
    {
      enabled: target === DocDefaultFilter.TRASHBIN,
      ...LIVE_LIST_REFETCH,
    },
  );

  const docsQuery = useInfiniteDocs(
    {
      page: 1,
      ...(target &&
        target !== DocDefaultFilter.ALL_DOCS && {
          is_creator_me: target === DocDefaultFilter.MY_DOCS,
        }),
    },
    {
      enabled: target !== DocDefaultFilter.TRASHBIN,
      ...LIVE_LIST_REFETCH,
    },
  );

  return target === DocDefaultFilter.TRASHBIN ? trashbinQuery : docsQuery;
};
