import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 云文档侧的两条「栏」必须与 we-meet 宿主同一档 —— 这份断言就是那条约束。
 *
 * 宿主那边的唯一定义:
 *   - 二级导航栏栏头 components/SubNav.tsx(SubNavHeader):内边距 16/8、高 56px、
 *     16px **bold** 标题、1px 底分割线;
 *   - 内容标题栏 components/TitleBar.tsx:同样 56 + 1px 线,标题 16px bold、
 *     备注 12px 次要色。
 *
 * 这里是跨仓库的**值**对齐(两个 App 各有各的设计系统,组件不能共用),所以用读取
 * CSS 的方式把它钉住:谁在文档侧把高度/字重改回去,这条会红。
 */
const cssDir = join(__dirname, '..');

const readCss = (file: string) =>
  readFileSync(join(cssDir, file), 'utf8').replace(/\s+/g, ' ');

describe('we-meet bar styles in the docs app', () => {
  it('subnav header: 56px tall, 16/8 padding, 1px bottom border', () => {
    const css = readCss('we-meet-ui.css');
    const block = css.slice(
      css.indexOf('.wm-subnav-header {'),
      css.indexOf('.wm-ui .wm-subnav-header__title'),
    );
    expect(block).toContain('min-height: 3.5rem');
    expect(block).toContain('padding: var(--wm-space-sm) var(--wm-space-lg)');
    expect(block).toContain('border-bottom: 1px solid var(--wm-border-subtle)');
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
});
