import {defineConfig} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.join(os.homedir(),'.agent-browser/browsers');
const cached=fs.existsSync(root)?fs.readdirSync(root).find(n=>n.startsWith('chrome-')):null;
const candidate=cached?path.join(root,cached,'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'):null;
const executablePath=process.env.CHROME_PATH||(candidate&&fs.existsSync(candidate)?candidate:undefined);
fs.mkdirSync('coverage',{recursive:true});
export default defineConfig({
  testDir:'./tests/browser',workers:1,fullyParallel:false,timeout:30000,
  use:{locale:'vi-VN',baseURL:process.env.EDGE_TEST_BASE||'http://localhost:8787',headless:true,launchOptions:{executablePath,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${path.join(process.cwd(),'tests/fixtures/voice.wav')}`]}},
  reporter:'list',
  webServer:process.env.EDGE_TEST_BASE?{command:'node scripts/edge-dev.ts',url:process.env.EDGE_TEST_BASE+'/health',reuseExistingServer:!process.env.CI,timeout:30000}:{command:'npm run build:client && cargo run',url:'http://localhost:8787/health',reuseExistingServer:!process.env.CI,env:{PIN_PEPPER:'test-only-pepper-not-for-production-0123456789',DATABASE_URL:'sqlite://coverage/browser.db?mode=rwc'},timeout:120000}
});
