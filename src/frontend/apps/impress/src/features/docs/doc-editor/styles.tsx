import { createGlobalStyle } from 'styled-components';

export const DocsEditorStyle = createGlobalStyle`
  .bn-container {
    height: 100%;
    /* 正文画布跟随 docs 的面色。BlockNote 的深浅由它自己的 theme prop 驱动
     * (见 BlockNoteEditor),那套调色板与 Cunningham 不是一套 —— 不钉这一条,
     * 深色下编辑区会是 BlockNote 自己的深灰,与外层页面差出一个色阶,正文区
     * 像贴上去的另一块板子。 */
    background-color: var(--c--contextuals--background--surface--primary);
  }
  /**
  * Token Blocknote
  *
  * BlockNote 只暴露这三个颜色变量(@blocknote/core 的 style.css),其余配色走它
  * 内部的 Mantine color-scheme,改不了 —— 所以目标是「同色系、不刺眼」,不是
  * 与 Cunningham 像素级一致。
  */
  .bn-root[data-color-scheme] {
    /* ⭐ 正文画布底色。BlockNote 自己在 .bn-root[data-color-scheme=dark] 里把它钉成
     * #1f1f1f、浅色是 #fff —— 浅色那档**碰巧**等于 docs 的面色(#FFFFFF),所以一直
     * 没人发现;深色下 #1f1f1f 与页面底不同,正文就成了一块颜色不一样的板子
     * (改品牌色之前面色是 #2F3033,板子偏暗;之后是 #161616,板子偏亮 —— 方向变了,
     * 但一直都有缝)。
     *
     * ⚠️ 这条只是「顺手把变量也接对」,**不能当作修复本身**:选择器与 BlockNote 那条
     * 同为 (0,2,0),谁赢取决于注入顺序,而 BlockNote 的样式表是随动态 chunk(DocEditor
     * 是 next/dynamic 懒加载的)在运行时插进 head 的,顺序不可靠 —— 实测线上带了这条
     * 变量覆盖后板子依旧,就是输在了顺序上。真正兜底的是下面 .bn-root .bn-editor
     * 那条:specificity 更高,与顺序无关。 */
    --bn-colors-editor-background: var(
      --c--contextuals--background--surface--primary
    );
    --bn-colors-editor-text: var(
      --c--contextuals--content--semantic--neutral--primary
    );
    --bn-colors-side-menu: var(
      --c--contextuals--content--semantic--neutral--tertiary
    );
    --bn-colors-hovered-background: var(
      --c--contextuals--background--semantic--contextual--primary
    );
  }
  .bn-root .mantine-Chip-label {
    --chip-color: var(--c--contextuals--content--semantic--brand--tertiary);
    --mantine-primary-color-filled-hover: var(--c--contextuals--content--semantic--brand--tertiary);
  }

  .bn-root {
    .bn-editor {
      height: 100%;
      /* ⭐ 深色下「正文是一块颜色不一样的板子」的正解。
       *
       * BlockNote 自己用 .bn-editor 的 background-color 画正文画布,取
       * --bn-colors-editor-background:深色档钉死 #1f1f1f、浅色档 #fff。浅色那档
       * **碰巧**等于 docs 的面色(#FFFFFF)所以从没露过馅;深色下两者不等,正文就浮出一块。
       *
       * 只覆盖那个变量不够 —— 变量声明与 BlockNote 的同 specificity,胜负取决于注入
       * 顺序,而它的样式表随懒加载 chunk 在运行时插入,顺序不可靠(线上实测输了)。
       * 这里直接钉在元素上:.bn-root .bn-editor 是 (0,2,0),压过 BlockNote 的
       * .bn-editor (0,1,0),**与顺序无关**。 */
      background-color: var(--c--contextuals--background--surface--primary);
    }

    .mantine-Menu-itemLabel,
    .mantine-Button-label {
      font-family: var(--c--components--button--font-family);
    }

    /**
    * Ensure long placeholder text is truncated with ellipsis
    */
    .bn-block-content[data-is-empty-and-focused][data-content-type='paragraph']
      .bn-inline-content:has(> .ProseMirror-trailingBreak:only-child)::before {
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow: hidden;
      width: inherit;
      height: inherit;
    }
    .bn-block-content[data-is-empty-and-focused][data-content-type='paragraph']
      .bn-inline-content:has(> .ProseMirror-trailingBreak:only-child) {
      position: relative;
    }

    /**
    * Ensure images with unsafe URLs are not interactive
    */
    img.bn-visual-media[src*='-unsafe'] {
      pointer-events: none;
    }

    /**
    * Collaboration cursor styles
    */
    .collaboration-cursor-custom__base {
      position: relative;
    }
    .collaboration-cursor-custom__caret {
      position: absolute;
      height: 100%;
      width: 2px;
      bottom: 4%;
      left: -1px;
    }
    .collaboration-cursor-custom__label {
      color: #0d0d0d;
      font-size: 12px;
      font-weight: 600;
      -webkit-user-select: none;
      -moz-user-select: none;
      user-select: none;
      position: absolute;
      top: -17px;
      left: 0px;
      padding: 0px 6px;
      border-radius: 0px;
      white-space: nowrap;
      transition: clip-path 0.3s ease-in-out;
      border-radius: 4px 4px 4px 0;
      box-shadow: inset -2px 2px 6px #ffffff00;
      clip-path: polygon(0 85%, 4% 85%, 4% 100%, 0% 100%);
    }
    .collaboration-cursor-custom__base[data-active]
      .collaboration-cursor-custom__label {
      pointer-events: none;
      box-shadow: inset -2px 2px 6px #ffffff88;
      clip-path: polygon(0 0, 100% 0%, 100% 100%, 0% 100%);
    }

    /**
    * Side menu
    */
    .bn-side-menu .mantine-UnstyledButton-root svg {
      color: var(
        --c--contextuals--content--semantic--neutral--tertiary
      ) !important;
    }

    /**
    * Callout, Paragraph and Heading blocks
    */
    .bn-block {
      border-radius: var(--c--globals--spacings--3xs);
    }
    .bn-block-outer {
      border-radius: var(--c--globals--spacings--3xs);
    }
    .bn-block > .bn-block-content[data-background-color] {
      padding: var(--c--globals--spacings--3xs) var(--c--globals--spacings--3xs);
      border-radius: var(--c--globals--spacings--3xs);
    }
    .bn-block-content[data-content-type='checkListItem'][data-checked='true']
      .bn-inline-content {
      text-decoration: none;
    }
    a {
      color: var(--c--globals--colors--gray-600);
      cursor: pointer;
    }
    .bn-block-group
      .bn-block-group
      .bn-block-outer:not([data-prev-depth-changed]):before {
      border-left: none;
    }

    .bn-toolbar {
      max-width: 95vw;
    }

    /**
    * Quotes
    */
    blockquote {
      border-left: 4px solid var(--c--globals--colors--gray-300);
      font-style: italic;
    }

    /**
    * AI
    */
    ins,
    [data-type='modification'] {
      background: var(--c--globals--colors--brand-100);
      border-bottom: 2px solid var(--c--globals--colors--brand-300);
      color: var(--c--globals--colors--brand-700);
    }

    /**
    * Divider
    */
    [data-content-type='divider'] hr {
      background: #d3d2cf;
      margin: 1rem 0;
      width: 100%;
      border: 1px solid #d3d2cf;
    }
    .bn-side-menu[data-block-type='divider'] {
      height: 38px;
    }

    /**
    * Checklist items
    */
    .bn-block-content[data-content-type='checkListItem'] > div > input {
      appearance: none;
      width: 20px;
      height: 20px;
      border: 2px solid
        var(--c--contextuals--content--semantic--neutral--tertiary);
      border-radius: 4px;
      cursor: pointer;
      position: relative;
      align-self: center;
      margin-top: 2px;
    }
    .bn-block-content[data-content-type='checkListItem'] > div > input:checked {
      background-color: var(--c--contextuals--content--semantic--brand--tertiary);
      border-color: var(--c--contextuals--content--semantic--brand--tertiary);
    }
    .bn-block-content[data-content-type='checkListItem']
      > div
      > input:checked::after {
      content: 'check';
      font-family: 'Material Symbols Outlined Variable', sans-serif;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: var(--c--contextuals--content--semantic--overlay--primary);
      font-size: 18px;
    }

    /**
      * Headings
      * Ensure consistent spacing between headings and paragraphs
    */
    [data-content-type='heading'] {
      --level: 1.875rem;
      padding-top: 3px;
      &[data-level='2'] {
        --level: 1.5rem;
      }
      &[data-level='3'] {
        --level: 1.25rem;
      }
      &[data-level='4'] {
        --level: 1.125rem;
      }
      &[data-level='5'] {
        --level: 1rem;
      }
      &[data-level='6'] {
        --level: 0.875rem;
      }
    }
    .bn-side-menu[data-block-type='heading'][data-level='1'] {
      height: 54px;
    }
    .bn-side-menu[data-block-type='heading'][data-level='2'] {
      height: 43px;
    }
    .bn-side-menu[data-block-type='heading'][data-level='3'] {
      height: 35px;
    }
    & .bn-default-styles h1 {
      font-size: 1.875rem;
    }
    & .bn-default-styles h2 {
      font-size: 1.5rem;
    }
    & .bn-default-styles h3 {
      font-size: 1.25rem;
    }
    & .bn-default-styles h4 {
      font-size: 1.125rem;
    }
    & .bn-default-styles h5 {
      font-size: 1rem;
    }
    & .bn-default-styles h6 {
      font-size: 0.875rem;
    }
    & .bn-block-outer:not(:first-child):not(:has([data-content-type="toggleListItem"])) {
      &:has(h1) {
        margin-top: 32px;
      }
      &:has(h2) {
        margin-top: 24px;
      }
      &:has(h3) {
        margin-top: 16px;
      }
    }

    & .bn-inline-content code {
      background-color: gainsboro;
      padding: 2px;
      border-radius: 4px;
    }

    @media screen and (width <= 768px) {
      & .bn-editor {
        padding-right: 36px;
      }
    }

    @media screen and (width <= 560px) {
      .--docs--doc-readonly & .bn-editor {
        padding-left: 10px;
      }
      & .bn-editor {
        padding-right: 10px;
      }
      .bn-side-menu[data-block-type='heading'][data-level='1'] {
        height: 46px;
      }
      .bn-side-menu[data-block-type='heading'][data-level='2'] {
        height: 40px;
      }
      .bn-side-menu[data-block-type='heading'][data-level='3'] {
        height: 40px;
      }
      [data-content-type='heading'] {
        --level: 1.6rem;
        &[data-level='2'] {
          --level: 1.35rem;
        }
        &[data-level='3'] {
          --level: 1.2rem;
        }
        &[data-level='4'] {
          --level: 1.125rem;
        }
        &[data-level='5'] {
          --level: 1rem;
        }
        &[data-level='6'] {
          --level: 0.875rem;
        }
      }
      & .bn-editor h1 {
        font-size: 1.6rem;
      }
      .bn-block-content[data-is-empty-and-focused][data-content-type='paragraph']
        .bn-inline-content:has(> .ProseMirror-trailingBreak:only-child)::before {
        font-size: 14px;
      }
    }
  }
`;
