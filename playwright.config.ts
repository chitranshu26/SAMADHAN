import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect:{timeout:15_000},
  fullyParallel:false, workers:1, retries:0,
  reporter:[['list'],['html',{open:'never'}],['json',{outputFile:'work/test-results.json'}]],
  use:{ baseURL:process.env.TEST_BASE_URL||'http://127.0.0.1:3000', headless:true, trace:'retain-on-failure', screenshot:'only-on-failure', launchOptions:{channel:'msedge'} },
  projects:[{name:'desktop', use:{...devices['Desktop Edge'],channel:'msedge'}}]
});
