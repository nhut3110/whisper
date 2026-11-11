import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({testDir:'./tests/music',workers:1,timeout:20000,use:{...base.use,baseURL:'http://127.0.0.1:8792'},webServer:{command:'node experiments/deezer-preview/server.mjs',env:{MUSIC_LAB_PORT:'8792'},url:'http://127.0.0.1:8792',reuseExistingServer:false},reporter:'list'});
