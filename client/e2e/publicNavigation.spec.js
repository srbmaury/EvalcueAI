import { test, expect } from './fixtures.js';
const mockSignedOut = (page) => page.route('**/api/auth/refresh', route => route.fulfill({status:401,contentType:'application/json',body:'{"message":"Unauthenticated"}'}));

test('new public routes reset scroll while anchor links reach their section', async ({ page }) => {
    await mockSignedOut(page);
    await page.goto('/practice/resources/software-engineer-mock-interview');
    await page.getByRole('link', {name:'Privacy', exact:true}).scrollIntoViewIfNeeded();
    expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
    await page.getByRole('link', {name:'Privacy', exact:true}).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    await page.goto('/privacy#main-content');
    await expect(page.locator('#main-content')).toBeInViewport();
});
