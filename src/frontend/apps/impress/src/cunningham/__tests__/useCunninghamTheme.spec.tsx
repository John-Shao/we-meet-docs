import { useCunninghamTheme } from '../useCunninghamTheme';

/**
 * 这几条都是**回归守卫**,不是在测"框架能不能换主题"。
 *
 * 背景:`@gouvfr-lasuite/cunningham-tokens` 的 defaultConfig 自带一份 `dark`,用的是
 * 包自己的 globals。`cunningham.ts` 若不显式声明 `dark`,那份就原样存活 —— 后果是
 * 深浅两个主题换了色相,且 `cunningham.ts` 里的 overrides 对深色**完全不生效**
 * (线上表现:切深色时全站字体从 Inter 掉回系统 sans-serif,因为包里的 dark 把
 * font-family 指向了 globals.css 从未 @import 过的 Roboto Flex)。
 *
 * 这个坑不报错、只变丑,光读代码也看不出来,所以钉在测试里。
 */
describe('<useCunninghamTheme />', () => {
  const fontBase = () =>
    useCunninghamTheme.getState().themeTokens?.font?.families?.base;
  const brand550 = () =>
    useCunninghamTheme.getState().colorsTokens?.['brand-550'];

  beforeEach(() => {
    useCunninghamTheme.getState().setTheme('default');
  });

  it('字体栈与 we-meet 主应用一致(不含中文字体名,中文走 system-ui 回落)', () => {
    expect(fontBase()).toContain('ui-sans-serif');
    expect(fontBase()).toContain('system-ui');
    expect(fontBase()).not.toContain('Roboto Flex');
    expect(fontBase()).not.toContain('Marianne');
  });

  it('深浅主题共用同一个字体栈', () => {
    const light = fontBase();
    useCunninghamTheme.getState().setTheme('dark');
    expect(fontBase()).toBe(light);
  });

  it('深浅主题共用同一支品牌蓝(主操作 = meet primary.500)', () => {
    expect(brand550()?.toLowerCase()).toBe('#3370ff');
    useCunninghamTheme.getState().setTheme('dark');
    expect(brand550()?.toLowerCase()).toBe('#3370ff');
  });

  it('深色主面与 meet 外壳同底,不是「嵌在暗壳里的亮板子」', () => {
    useCunninghamTheme.getState().setTheme('dark');
    expect(
      useCunninghamTheme
        .getState()
        .contextualTokens?.background?.surface?.primary?.toLowerCase(),
    ).toBe('#161616');
  });
});
