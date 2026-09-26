'use strict';
const assert=require('assert'),vm=require('vm');const {clientScript}=require('../src/test_session_selection');
let active='tests';const tabs=['tests','diagnostics','results'].map(tab=>({dataset:{tab},click:()=>active=tab})),suites=[{dataset:{suite:'universal'},checked:true},{dataset:{suite:'game-a'},checked:false},{dataset:{suite:'unavailable'},checked:false,disabled:true}];
const box={document:{querySelector:()=>tabs.find(tab=>tab.dataset.tab===active),querySelectorAll:selector=>selector==='.tab'?tabs:selector==='[data-suite]:checked'?suites.filter(suite=>suite.checked):suites}};
vm.createContext(box);vm.runInContext(clientScript(),box);
const saved=box.ikemenNavigationSelection();assert.equal(saved.tab,'tests');assert.deepEqual([...saved.suiteIds],['universal']);
box.ikemenRestoreNavigation({tab:'results',suiteIds:['game-a']});assert.equal(active,'results');assert(!suites[0].checked);assert(suites[1].checked);
assert(!box.ikemenCanRestoreNavigation({tab:'tests',suiteIds:['missing']}));assert(!box.ikemenCanRestoreNavigation({tab:'tests',suiteIds:['unavailable']}));assert.throws(()=>box.ikemenRestoreNavigation({tab:'missing',suiteIds:[]}),/no longer available/);assert.equal(active,'results','invalid restoration leaves selection intact');
console.log('Tests preset selection restores tabs/suites and refuses unavailable selections without launching or changing profiles');
