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

test('unknown URLs and unknown guide slugs show a not-found page instead of silently opening home', async ({ page }) => {
    await mockSignedOut(page);
    for (const path of ['/this-does-not-exist', '/interview-questions/rate-limiter']) {
        await page.goto(path);
        await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`));
        await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
    await page.getByRole('link', { name: 'EvalcueAI home' }).click();
    await expect(page).toHaveURL(/\/$/);
});
