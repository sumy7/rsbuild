import { test, expect } from '@playwright/test';
import { build, gotoPage, rspackOnlyTest } from '@e2e/helper';
import { pluginBabel } from '@rsbuild/plugin-babel';

test('should run stage 3 decorators correctly', async ({ page }) => {
  const rsbuild = await build({
    cwd: __dirname,
    runServer: true,
  });

  await gotoPage(page, rsbuild);
  expect(await page.evaluate('window.message')).toBe('hello');
  expect(await page.evaluate('window.method')).toBe('targetMethod');
  expect(await page.evaluate('window.field')).toBe('message');

  await rsbuild.close();
});

rspackOnlyTest(
  'should run stage 3 decorators correctly with babel-plugin',
  async ({ page }) => {
    const rsbuild = await build({
      cwd: __dirname,
      runServer: true,
      plugins: [pluginBabel()],
    });

    await gotoPage(page, rsbuild);
    expect(await page.evaluate('window.message')).toBe('hello');
    expect(await page.evaluate('window.method')).toBe('targetMethod');
    expect(await page.evaluate('window.field')).toBe('message');

    await rsbuild.close();
  },
);
