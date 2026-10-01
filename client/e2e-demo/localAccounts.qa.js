import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../../server/companionai_demo_accounts_manifest.json',import.meta.url),'utf8'));
for(const [index,account] of manifest.accounts.entries()) {
 test(`demo account ${index+1}: ${account.type} signs in and opens authorized screens`,async({page})=>{
  // Model independent demo users from separate client IPs in this isolated QA server.
  await page.setExtraHTTPHeaders({'X-Forwarded-For':`127.0.0.${index+2}`});
  const hiring=account.type==='hire_user';
  await page.goto(hiring?'/hire/login':'/practice/login');
  await page.getByRole('textbox',{name:'Email',exact:true}).fill(account.email);
  await page.getByRole('textbox',{name:'Password',exact:true}).fill(manifest.sharedDemoPassword);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(hiring?/\/hire\/assessments$/:/\/practice\/dashboard$/);
  await page.reload();
  await expect(page).toHaveURL(hiring?/\/hire\/assessments$/:/\/practice\/dashboard$/);
  const screens=hiring?['/hire/assessments','/hire/team']:['/practice/profile','/practice/progress','/practice/resumes','/practice/resume-review','/practice/company-insights','/practice/pricing'];
  if(account.type==='platform_admin') screens.push('/admin/feedback','/admin/audit');
  for(const path of screens){
   await page.goto(path);
   await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
   await expect(page.getByText('Something went wrong',{exact:true})).toHaveCount(0);
  }
 });
}
