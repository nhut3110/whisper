import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,testMatch:'chat.spec.js',use:{...base.use,baseURL:'http://localhost:8788'},webServer:{command:'node scripts/edge-dev.ts',url:'http://localhost:8788/health',reuseExistingServer:!process.env.CI,timeout:30000},reporter:'list'});
