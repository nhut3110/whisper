import {defineConfig} from '@playwright/test';import base from './playwright.config.js';
export default defineConfig({...base,testIgnore:[],testMatch:'first-paint.spec.js',webServer:process.env.WHISPER_FIRST_PAINT_SERVER?base.webServer:undefined,reporter:'list'});
