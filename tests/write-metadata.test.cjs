const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/app.js'),'utf8');
function run(name,next,state,extra={}){
 const context={state,...extra};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'(')),context);
 return context;
}
test('explicitly edited chapter titles survive legacy migration after save and reload',()=>{
 const state=JSON.parse(JSON.stringify({acts:[{title:'에피소드 1',chapters:[{title:'Chapter 137',titleEdited:true},{title:'137',titleEdited:true},{title:'Chapter 3'}]}]}));
 const ctx=run('migrateHierarchyTitles','updateEpisodeGroupTitle',state);
 assert.deepEqual(state.acts[0].chapters.map(c=>c.title),['Chapter 137','137','003']);
 ctx.migrateHierarchyTitles();assert.equal(state.acts[0].chapters[0].title,'Chapter 137');
});
test('chapter progress combines scenes against 5000 characters and permits over 100 percent',()=>{
 const state={scenes:{s1:{text:'가 나😀'},s2:{text:'다라마'},other:{text:'다른 회차'}}};
 const ctx=run('writingProportion','updateWriteProportion',state,{chapterForScene:()=>({scenes:['s1','s2']})});
 assert.equal(ctx.writingProportion('s1').current,6);
 assert.equal(ctx.writingProportion('s1').total,5000);
 assert.equal(ctx.writingProportion('s1').percent,0.12);
 state.scenes.s1.text='가'.repeat(5997);assert.equal(ctx.writingProportion('s1').percent,120);
 state.scenes.s1.text='';state.scenes.s2.text='';assert.equal(ctx.writingProportion('s1').percent,0);
});
