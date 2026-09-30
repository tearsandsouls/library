const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const s=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/app.js'),'utf8');
const ctx={charById:id=>id==='a'?{baseAge:29}:null};vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function scenePeriod('),s.indexOf('function ageText(')),ctx);
test('relative scene periods are preserved literally',()=>{assert.equal(ctx.scenePeriodLabel({timelineLabel:'1달 뒤'}),'1달 뒤');assert.equal(ctx.scenePeriodLabel({timelineLabel:'첫 만남 1년 뒤'}),'첫 만남 1년 뒤')});
test('clearing a legacy year explicitly leaves the period undecided',()=>{assert.equal(ctx.scenePeriodLabel({year:2026}),'2026');assert.equal(ctx.scenePeriodLabel({year:2026,timelineLabel:''}),'시점 미정');assert.equal(ctx.scenePeriodLabel({year:null}),'시점 미정')});
test('first appearance age does not assume a calendar year',()=>{assert.equal(ctx.ageAt('a',2030),29);assert.equal(ctx.ageAt('a','1달 뒤'),29);assert.equal(ctx.ageAt('unknown'),null)});
