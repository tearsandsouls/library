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
test('proportions use only ordered manuscript text, exclude spaces and handle empty books',()=>{
 const state={scenes:{s1:{text:'가 나😀'},s2:{text:'다라마'},orphan:{text:'unlinked'}},behind:{text:'not manuscript'}};
 const ctx=run('writingProportion','updateWriteProportion',state,{orderedSceneIds:()=>['s1','s2','s1']});
 assert.equal(ctx.writingProportion('s1').percent,50);
 assert.equal(ctx.writingProportion('s1').total,6);
 state.scenes.s1.text='';state.scenes.s2.text='';assert.equal(ctx.writingProportion('s1').percent,0);
});
