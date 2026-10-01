import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e-demo',testMatch:'localAccounts.qa.js',workers:2,timeout:60000,expect:{timeout:15000},reporter:[['line'],['html',{outputFolder:'playwright-report-local-demo',open:'never'}]],use:{...devices['Desktop Chrome'],baseURL:'http://127.0.0.1:5175',headless:true,screenshot:'only-on-failure'}});
