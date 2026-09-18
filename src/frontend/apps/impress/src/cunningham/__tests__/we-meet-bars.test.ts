import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 云文档侧的两条「栏」必须与 we-meet 宿主同一档 —— 这份断言就是那条约束。
 *
 * 宿主那边的唯一定义:
 *   - 二级导航栏栏头 components/SubNav.tsx(SubNavHeader):内边距 16/8、高 56px、
 *     16px **bold** 标题在左、28px 图标钮(16px 字形)在右、**没有底分割线**;
 *   - 内容标题栏 components/TitleBar.tsx:56 + 1px 线,标题 16px bold、备注 12px 次要色。
 *
 * 这里是跨仓库的**值**对齐(两个 App 各有各的设计系统,组件不能共用),所以用读取
 * CSS 的方式把它钉住:谁在文档侧把高度/字重/摆放改回去,这条会红。
 */
const cssDir = join(__dirname, '..');

const readCss = (file: string) =>
  readFileSync(join(cssDir, file), 'utf8').replace(/\s+/g, ' ');

describe('we-meet bar styles in the docs app', () => {
  it('subnav header: a 56px row, 16/8 padding, with no divider', () => {
    const css = readCss('we-meet-ui.css');
    const block = css.slice(
      css.indexOf('.wm-subnav-header {'),
      css.indexOf('.wm-ui .wm-subnav-header__title'),
    );
    expect(block).toContain('min-height: 3.5rem');
    expect(block).toContain('padding: var(--wm-space-sm) var(--wm-space-lg)');
    // 栏头是 Box 渲染的,而 Box 的基样式写死了 `flex-direction: column`(单类,
    // 运行时注入在后)—— 不显式写回 row,这条栏会在线上竖排成「标题居中在上、
    // 图标居中在下」。选择器带 .wm-ui 才压得住那条基样式。
    expect(css).toContain('.wm-ui .wm-subnav-header {');
    expect(block).toContain('flex-direction: row');
    // 宿主 SubNavHeader 没有底分割线(那是内容标题栏 TitleBar 的)。
    expect(block).not.toContain('border-bottom');
  });

  it('subnav header actions: one row of 28px buttons with 16px glyphs', () => {
    const css = readCss('we-meet-ui.css');
    const block = css.slice(
      css.indexOf('.wm-ui .wm-subnav-header__actions'),
      css.indexOf('.wm-ui, .c__dropdown-menu'),
    );
    expect(block).toContain('flex-direction: row');
    // 宿主 headerActions 的间距是 `space.xxs`(2px),盒子 28px / 字形 16px。
    expect(block).toContain('gap: var(--wm-space-xxs)');
    expect(block).toContain('.wm-ui .wm-subnav-header__actions .c__button svg');
    expect(block).toContain('width: var(--wm-icon-small)');
  });

  it('subnav title: 16px titleMedium at weight 700', () => {
    const css = readCss('we-meet-ui.css');
    // 必须带 .wm-ui 这一层:标题是个 Text 组件(styled-components 运行时注入的
    // 单类样式),平级选择器会被它按注入顺序压过去。
    expect(css).toContain('.wm-ui .wm-subnav-header__title');
    const block = css.slice(css.indexOf('.wm-ui .wm-subnav-header__title'));
    expect(block).toContain('font: var(--wm-font-title-medium)');
    expect(block).toContain('font-weight: 700');
  });

  it('grid title bar: 56px tall, 1px bottom border, bold title', () => {
    const css = readCss('we-meet-pages.css');
    const bar = css.slice(
      css.indexOf('& .wm-grid-titlebar {'),
      css.indexOf("& [data-testid='docs-grid'][data-loading]"),
    );
    expect(bar).toContain('min-height: 3.5rem');
    expect(bar).toContain('padding: var(--wm-space-sm) var(--wm-space-lg)');
    expect(bar).toContain('border-bottom: 1px solid var(--wm-border-subtle)');
    const title = css.slice(css.indexOf('& .wm-grid-titlebar h2'));
    expect(title).toContain('font: var(--wm-font-title-medium)');
    expect(title).toContain('font-weight: 700');
  });

  it('grid title bar spans the content column, not its own content width', () => {
    // 标题栏挂在 `--docs--doc-grid`(align-items: center)下面:不给 width: 100%
    // 它就会缩成内容宽并被水平居中,标题跑到内容区中间去 —— 线上截图里的
    // 「[图标] 所有文档 [新建]」居中一条就是这么来的。
    const src = readFileSync(
      join(cssDir, '../features/docs/docs-grid/components/DocsGrid.tsx'),
      'utf8',
    );
    expect(src).toContain('$width="100%"');
  });

  it('grid content is one surface: title bar over a frameless list', () => {
    const css = readCss('we-meet-pages.css');
    const container = css.slice(
      css.indexOf('.wm-ui.--docs--doc-grid {'),
      css.indexOf('& .wm-grid-titlebar {'),
    );
    // 内容标题栏与列表同处一张白面:内容区自己就是那张面,卡片退成纯容器 ——
    // 宿主每个模块都是「内容标题栏 + 内容」两条,不是「一张卡自带标题」。
    expect(container).toContain('background: var(--wm-surface-default)');
    expect(container).toContain('border: 0');
  });

  it('grid column is content-tall, so the white surface reaches the last row', () => {
    const css = readCss('we-meet-pages.css');
    const container = css.slice(
      css.indexOf('.wm-ui.--docs--doc-grid {'),
      css.indexOf('& .wm-grid-titlebar {'),
    );
    // 这一栏是 main(100dvh + overflow-y: auto)的 flex 项,组件上那个
    // `$minHeight="0"` 会让 flex 把它压到一屏高 —— 白面到不了列表末尾,滚动到底时
    // 最后几行落回页面底色(canvas 灰)。这里必须是 auto(内容高)。
    expect(container).toContain('min-height: auto');
  });
});
