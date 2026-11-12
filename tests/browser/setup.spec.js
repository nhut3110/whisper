import {test,expect} from '@playwright/test';
for(const width of [1440,390])test(`verification network failure recovers in place at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/api/challenges',route=>route.abort());
 await page.goto('/');await page.locator('#message').fill('Giữ nguyên bản nháp');await page.locator('#create').click();
 await expect(page.locator('#verification-note')).not.toBeEmpty();
 await expect(page.locator('#verify-body')).toBeHidden();await expect(page.locator('#verify-loading')).toBeHidden();await expect(page.locator('#settings-done')).toBeHidden();
 await expect(page.locator('#challenge-retry')).toHaveText('Thử lại');await expect(page.locator('#verification')).toHaveAttribute('aria-busy','false');
 await page.screenshot({path:`test-results/setup-error-${width}.png`});
 await page.unroute('**/api/challenges');await page.locator('#challenge-retry').click();
 await expect(page.locator('#verify-body')).toBeVisible();await expect(page.locator('#verify-failure')).toBeHidden();
 await expect(page.locator(width<600?'#mobile-challenge':'#desktop-challenge')).toBeVisible();
 await page.locator('[data-expiry="86400"]').focus();await page.keyboard.press('End');await expect(page.locator('#custom-expiry')).toBeVisible();
 await expect(page.locator('[data-expiry=custom]')).toHaveAttribute('aria-checked','true');
 await page.locator('#ttl-minutes').fill('15');await page.locator('.setup-privacy summary').click();await expect(page.locator('.setup-privacy p')).toBeVisible();
 expect(await page.locator('#settings').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:`test-results/setup-recovered-${width}.png`});
 await page.locator('#settings-close').click();await expect(page.locator('#message')).toHaveValue('Giữ nguyên bản nháp');
});
