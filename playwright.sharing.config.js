import {defineConfig} from '@playwright/test';import base from './playwright.config.js';
export default defineConfig({...base,testIgnore:[],testMatch:['sharing-spoiler.spec.js','optical.spec.js'],reporter:'list'});
