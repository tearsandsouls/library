const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../assets/js/app.js'),'utf8');
const helpers=source.slice(source.indexOf('function codexTerms('),source.indexOf('/* End character mention helpers. */'));
const ctx={};vm.createContext(ctx);vm.runInContext(helpers,ctx);
const matches=(text,c)=>JSON.parse(JSON.stringify(ctx.codexMatches(text,c)));
test('names and aliases match Korean prose without counting overlaps twice',()=>{assert.deepEqual(matches('권도진과 도진, 도진이형',{name:'권도진',aliases:['도진','도진이형']}),[[0,3],[5,7],[9,13]])});
test('excluded phrases suppress names inside them but retain other occurrences',()=>{assert.deepEqual(matches('형광등 아래 형',{name:'형',exclusions:['형광등']}),[[7,8]])});
test('case-sensitive matching and tracking switch are respected',()=>{assert.equal(matches('Alex alex',{name:'Alex'}).length,2);assert.equal(matches('Alex alex',{name:'Alex',caseSensitive:true}).length,1);assert.equal(matches('Alex',{name:'Alex',tracking:false}).length,0)});
test('literal punctuation is matched safely and empty aliases do not loop',()=>{assert.deepEqual(matches('A+B AAB',{name:'A+B',aliases:['','  ']}),[[0,3]])});

test('mentions excerpt distant occurrences, merge nearby ones and preserve highlights',()=>{const text='가'.repeat(200)+'윤서'+'나'.repeat(30)+'윤서'+'다'.repeat(400)+'윤서'+'라'.repeat(200);const spans=ctx.codexMatches(text,{name:'윤서'});const snippets=ctx.codexMentionExcerpts(text,spans);assert.equal(snippets.length,2);assert.equal(snippets[0].matches.length,2);assert.equal(snippets[1].matches.length,1);for(const item of snippets){assert.equal(item.leading,true);assert.equal(item.trailing,true);for(const [a,b] of item.matches)assert.equal(item.text.slice(a,b),'윤서')}assert.ok(snippets.reduce((n,s)=>n+s.text.length,0)<text.length)});
test('excerpts keep two neighboring explicit lines and handle start and end',()=>{const text='앞1\n앞2\n앞3\n윤서\n뒤1\n뒤2\n뒤3';const [snippet]=ctx.codexMentionExcerpts(text,ctx.codexMatches(text,{name:'윤서'}));assert.equal(snippet.text,'앞2\n앞3\n윤서\n뒤1\n뒤2');const [short]=ctx.codexMentionExcerpts('윤서',[[0,2]]);assert.equal(short.leading,false);assert.equal(short.trailing,false)});
