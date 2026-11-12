// Reproducible code-native brand cards. No message content ever enters an image.
import {chromium} from '@playwright/test';
import base from '../playwright.config.js';
import {brandSvg} from '../frontend/lib/brand.ts';
const browser=await chromium.launch(base.use.launchOptions);
const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
const variants={once:['Just once.','Open once. Then it is gone.'],timed:['For a little while.','A private message with an expiry.'],gone:['This whisper is gone.','No content is available at this link.']};
for(const [kind,[headline,sub]] of Object.entries(variants)){
 await page.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#f7f7f4;color:#262626;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;padding:64px 76px}header{display:flex;align-items:center;gap:18px;font-size:23px;font-weight:500}header svg{width:54px;height:42px}h1{font-size:68px;font-weight:500;letter-spacing:-3px;margin:118px 0 18px;max-width:790px;line-height:1.06}p{font-size:24px;color:#71716d;margin:0;max-width:700px}.mascot{position:absolute;right:78px;top:260px;width:180px;height:180px;background:#e8e8e3;border-radius:51px}.eyes{position:absolute;left:51px;top:67px;display:flex;gap:28px}.eyes i{width:15px;height:${kind==='gone'?14:23}px;background:#30302c;border-radius:8px}.mouth{position:absolute;left:80px;top:110px;width:20px;height:9px;border-bottom:4px solid #30302c;border-radius:0 0 50% 50%;${kind==='gone'?'rotate:180deg;':''}}footer{position:absolute;bottom:55px;font-size:17px;color:#92928b;letter-spacing:.3px}</style><body><header>${brandSvg()}Whisper.</header><h1>${headline}</h1><p>${sub}</p><div class="mascot"><div class="eyes"><i></i><i></i></div><div class="mouth"></div></div><footer>Encrypted on your device · Content stays out of previews</footer></body></html>`);
 await page.screenshot({path:`web/og-${kind}.png`});
}
await browser.close();
