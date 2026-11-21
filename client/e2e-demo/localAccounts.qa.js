import {test,expect} from '@playwright/test';
import { demoUsers, demoOrganizations } from '../../shared/demoAccounts.mjs';

const password = process.env.DEMO_PASSWORD;
const hiringEmails = new Set(demoOrganizations.flatMap(({ members }) => members.map(([email]) => email)));
for (const [index, account] of demoUsers.entries()) {
 test(`demo account ${index + 1} signs in and opens authorized screens`, async ({ page }) => {
  if (!password) throw new Error("Set DEMO_PASSWORD to match the isolated demo API");
  // Model independent demo users from separate client IPs in this isolated QA server.
  await page.setExtraHTTPHeaders({'X-Forwarded-For':`127.0.0.${index+2}`});
  const hiring = hiringEmails.has(account.email);
  await page.goto(hiring?'/hire/login':'/practice/login');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(account.email);
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(password);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(hiring?/\/hire\/assessments$/:/\/practice\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(hiring?/\/hire\/assessments$/:/\/practice\/dashboard$/);
  const screens=hiring?['/hire/assessments','/hire/team']:['/practice/profile','/practice/progress','/practice/resumes','/practice/resume-review','/practice/company-insights','/practice/pricing'];
  for(const path of screens){
   await page.goto(path);
   await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
  }
 });
}
