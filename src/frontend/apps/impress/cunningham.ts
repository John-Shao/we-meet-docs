import {
  getUIKitThemesFromGlobals,
  whiteLabelGlobals,
} from '@gouvfr-lasuite/ui-kit';

/**
 * we-meet 云文档主题。
 *
 * 目标:云文档是 we-meet 的一个模块(Web 端 iframe、App 端 WebView 内嵌),视觉必须
 * 和主应用同源,否则用户从「消息 / 日历 / 会议」切过来像换了一个 App。基准是
 * we-meet 仓库的 `src/frontend/panda.config.ts` —— 飞书蓝 + 中性灰 + 系统字体栈。
 *
 * ⚠️ 必须**显式声明 `dark`**。`@gouvfr-lasuite/cunningham-tokens` 的 defaultConfig
 * 自带 `themes: { default, dark }`,那份 dark 用的是**包自己的 globals**(另一支蓝
 * #2976D8 + 带蓝紫调的灰)。此前本文件只声明了 default,包里那份 dark 就原样存活,
 * 于是:① 深浅两个主题**换了色相**;② 下面的 overrides(字体、spacing)对 dark
 * 完全不生效 —— 表现为「切深色时全站字体从 Inter 掉回系统 sans-serif」,因为
 * 包里的 dark 把 font-family 指向了 `Roboto Flex Variable`,而 globals.css 从未
 * @import 过它。
 *
 * 生成:改完本文件跑 `yarn build-theme`,产物 `src/cunningham/cunningham-tokens.{ts,css}`
 * 一并提交;docs 前端改动需重建镜像才生效。
 */

/**
 * 与 we-meet `panda.config.ts` 的 `fonts.sans` **逐字一致**。
 *
 * 刻意不含中文字体名:主应用也没有,中文一律由 `system-ui` 回落到各 OS 默认
 * (苹方 / 微软雅黑 / Noto Sans CJK)。两端走**同一条回落链**才叫一致 —— 单给
 * 云文档钉一个具体中文字体,反而会和主应用差出一截。
 */
const WE_MEET_FONT_STACK =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

/**
 * 品牌色阶:we-meet 的飞书蓝。
 *
 * ⚠️ 相对主应用的色阶**整体错开一档**。Cunningham 把「主操作」锚在 `brand-550`
 * (见 contextualDefaultTokens 的 `background.semantic.brand.primary`)、hover 锚在
 * `brand-650`,而主应用的主操作是 `primary.500`、hover 是 `primary.600`。要让两边的
 * 主按钮**完全同色**,就得让 meet 的 500 落在 cunningham 的 550:
 *
 *   brand-550 = #3370FF = meet primary.500  (主操作)
 *   brand-650 = #2860D9 = meet primary.600  (hover)
 *   brand-750 = #1E4DB3 = meet primary.700  (active)
 *   brand-150 = #D6E4FF = meet primary.100  (浅蓝底,contextual brand.secondary)
 *   brand-100 = #EBF1FF = meet primary.50   (更浅的底,contextual brand.tertiary 的上一档)
 *
 * 其余档位由相邻锚点取中点插值(cunningham 的档位比主应用密一倍)。
 *
 * 对比度:白字压 brand-550 = 4.28:1 —— 与主应用的实心蓝按钮**同一个数值**,
 * 因为就是同一个色。这是刻意对齐的结果,不是本主题引入的问题;真要动得连主
 * 应用的品牌色一起改。深色面(#161616)上:brand-350 9.10:1、brand-450 5.78:1、
 * brand-550 作为控件面 4.22:1,均达标。
 */
const BRAND = {
  'brand-050': '#F5F8FF',
  'brand-100': '#EBF1FF',
  'brand-150': '#D6E4FF',
  'brand-200': '#C7DAFF',
  'brand-250': '#B7D0FF',
  'brand-300': '#A6C4FF',
  'brand-350': '#94B8FF',
  'brand-400': '#78A3FF',
  'brand-450': '#5C8DFF',
  'brand-500': '#487FFF',
  'brand-550': '#3370FF',
  'brand-600': '#2E68EC',
  'brand-650': '#2860D9',
  'brand-700': '#2357C6',
  'brand-750': '#1E4DB3',
  'brand-800': '#1A4199',
  'brand-850': '#16357F',
  'brand-900': '#0F2657',
  'brand-950': '#091633',
  // logo 色沿用品牌主色,别再留 La Suite 的靛紫。
  'logo-1-light': '#2860D9',
  'logo-2-light': '#2860D9',
  'logo-1-dark': '#94B8FF',
  'logo-2-dark': '#94B8FF',
};

/**
 * 中性灰:把 Cunningham 自带灰阶的蓝紫调去掉(#75758A → #777777),与主应用的
 * `greyscale.*` 同为中性灰。
 *
 * 做法是**保相对亮度 Y 去色相**(sRGB 线性化后取 Y,再还原成等亮度的灰),所以
 * 每一档的对比度与改前**逐档相同** —— 只掉色相,不动明暗关系。
 *
 * 刻意**不**照搬主应用那条 15 档灰阶:它的档位间距是不均匀的(300 #CECECE 到
 * 400 #929292 一步跨很大),而 docs 的组件依赖 gray-100 画边框、gray-500 画次要
 * 文字,硬套会打乱它自己的对比关系。这里只统一"色相",保留 cunningham 的疏密。
 */
const GRAY = {
  'gray-000': '#FFFFFF',
  'gray-025': '#F8F8F8',
  'gray-050': '#F0F0F0',
  'gray-100': '#E3E3E3',
  'gray-150': '#D5D5D5',
  'gray-200': '#C7C7C7',
  'gray-250': '#B9B9B9',
  'gray-300': '#ABABAB',
  'gray-350': '#9E9E9E',
  'gray-400': '#919191',
  'gray-450': '#848484',
  'gray-500': '#777777',
  'gray-550': '#6B6B6B',
  'gray-600': '#5F5F5F',
  'gray-650': '#535353',
  'gray-700': '#474747',
  'gray-750': '#3C3C3C',
  'gray-800': '#313131',
  'gray-850': '#262626',
  'gray-900': '#1C1C1C',
  'gray-950': '#111111',
  'gray-1000': '#000000',
};

/**
 * 组件级几何/配色。只改真正与主应用不一致的几项:
 *
 * - **按钮圆角 4 → 8**:主应用的按钮基准是常规 8px(`buttonRecipe.ts` 顶部注释)。
 *   表单控件(input / select / textarea / datepicker)**刻意不改** —— 主应用的
 *   Input/Select/TextArea 本来就是 4px,docs 也是 4px,已经一致。
 * - **badge.accent**:原值是 La Suite 靛紫。换成主应用的 `primary.subtle` 三件套
 *   口径(primary.100 底 + primary.700 字)。
 * - **resize-handle / datagrid**:这几个值是写死的十六进制,带着旧灰阶的蓝紫调,
 *   顺手换成等亮度中性灰。
 */
const COMPONENTS = {
  button: {
    'border-radius': '8px',
    'border-radius--active': '8px',
    'border-radius--focus': '8px',
  },
  badge: {
    accent: { 'background-color': '#D6E4FF', color: '#1E4DB3' },
    neutral: { 'background-color': '#E3E3E3', color: '#5F5F5F' },
  },
  'resize-handle': { 'hover--color': '#E3E3E3' },
  datagrid: {
    'header--color': '#262626',
    'body--background-color-hover': '#F0F0F0',
  },
};

/** 深浅共用的那部分 overrides(色阶、字体、间距、组件几何)。 */
const baseOverrides = {
  globals: {
    spacing: {
      '0': '0rem',
      none: '0rem',
      auto: 'auto',
      bx: '2.2rem',
      full: '100%',
      '3xs': '0.25rem',
      '2xs': '0.375rem',
    },
    font: {
      families: { base: WE_MEET_FONT_STACK, accent: WE_MEET_FONT_STACK },
    },
    colors: { ...BRAND, ...GRAY },
  },
  components: COMPONENTS,
};

const themeLight = getUIKitThemesFromGlobals(whiteLabelGlobals, {
  prefix: 'wm',
  variants: ['light'],
  overrides: baseOverrides,
});

const themeDark = getUIKitThemesFromGlobals(whiteLabelGlobals, {
  prefix: 'wm',
  variants: ['dark'],
  overrides: {
    ...baseOverrides,
    /**
     * 深色面色钉到主应用的 `greyscale.*` 深色档。
     *
     * 不钉的话,docs 的主面是 `gray-800`(#313131),而 meet 外壳的页面底是
     * `greyscale.000` 深色值 #161616 —— iframe 会像一块**更亮的板子**嵌在更暗的
     * 壳里,边界一眼可见。浅色两边本来都是 #FFFFFF,只有深色错位。
     *
     * ⚠️ 这会**反转** cunningham 原本的明暗次序:上游深色里 surface.primary 是
     * 三个面中最亮的(gray-800 > gray-850 > gray-900),这里改成最暗。docs 里
     * surface.primary 有 30+ 处引用、绝大多数是"主面",少数用作卡片/浮层的地方
     * 可能因此与背景贴平 —— 部署后要逐屏看一遍,真有问题就把那几处单独提到
     * surface.secondary,别回退整体映射。
     */
    contextuals: {
      background: {
        surface: {
          primary: '#161616', // = meet greyscale.000 (dark)
          secondary: '#1E1E1E', // = meet greyscale.50  (dark)
          tertiary: '#242424', // = meet greyscale.100 (dark)
        },
      },
    },
  },
});

/**
 * 只留 default / dark 两个主题。
 *
 * 上游的 `dsfr`(法国政府视觉,Marianne 字体)在 we-meet 场景没有意义:后端
 * `FRONTEND_THEME` 默认为 None、部署 values 里也没设过,内嵌时更是直接跳过它。
 * 留着只是让产物多一套永远不会被选中的 token。
 */
const docsTokens = {
  themes: {
    default: themeLight['wm-light'],
    dark: themeDark['wm-dark'],
  },
};

export default docsTokens;
