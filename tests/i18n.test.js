import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectLocale,dictionaries,names} from '../web/i18n.js';
test('locale matching follows browser preference order with English fallback',()=>{
 for(const [languages,expected] of [[['vi-VN','en'],'vi'],[['zh-TW'],'zh'],[['pt-BR'],'pt'],[['xx','ja-JP'],'ja'],[['xx-ZZ'],'en'],[[],'en'],[['AR_sa'],'ar']])assert.equal(detectLocale(languages),expected);
});
test('all 16 local dictionaries have all UI strings and preserve placeholders',()=>{
 const base=dictionaries.en;assert.equal(Object.keys(names).length,16);
 for(const [lang,dictionary] of Object.entries(dictionaries)){
  assert.deepEqual(Object.keys(dictionary),Object.keys(base),lang);
  for(const [key,value] of Object.entries(dictionary)){assert.ok(value.trim(),`${lang}.${key}`);assert.deepEqual((value.match(/\{\w+\}/g)||[]).sort(),(base[key].match(/\{\w+\}/g)||[]).sort(),`${lang}.${key}`);}
 }
});
