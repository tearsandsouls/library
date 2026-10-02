(()=>{
const localStorage=window.libraryStore;
const STORAGE_KEY='unused_legacy';
const baseData=blankState();
const DEFAULT_NOVEL_ID='demo-harbor';
let activeNovelId=DEFAULT_NOVEL_ID;
let saveTimer=null;
let dirty=false;
let storageBlocked=false;
let mediaBusy=false;
let storyAgeCache=null;
function storageKey(id=activeNovelId){return `storyloom_novel_v2_${id}`}
function blankState(){return {baseYear:null,characters:[],acts:[{id:'a1',title:'에피소드 1',subtitle:'',chapters:[{id:'ch1',title:'001',scenes:['s1']}]}],scenes:{s1:{id:'s1',title:'Scene 1',year:null,timelineLabel:'',time:'',location:'',pov:'',characters:[],goal:'',notes:'',text:'',bodyHtml:'',media:[]}},snippets:''}}
function loadNovelState(id){
  storageBlocked=false;
  try{
    const raw=localStorage.getItem(storageKey(id));
    if(!raw)return id===DEFAULT_NOVEL_ID?structuredClone(baseData):blankState();
    const data=JSON.parse(raw);
    if(!data||!data.scenes||!Array.isArray(data.acts)||!data.acts.length||!Array.isArray(data.characters)||!data.acts.every(a=>Array.isArray(a.chapters)&&a.chapters.length&&a.chapters.every(c=>Array.isArray(c.scenes)&&c.scenes.length&&c.scenes.every(sid=>data.scenes[sid]))))throw new Error('Invalid saved structure');
    return data;
  }catch(error){storageBlocked=true;return id===DEFAULT_NOVEL_ID?structuredClone(baseData):blankState()}
}
let state=loadNovelState(activeNovelId);
function normalizeScene(scene){if(!Array.isArray(scene.media))scene.media=[];scene.media=scene.media.map((m,i)=>({...m,id:m.id||`${scene.id}-m${i+1}`,blobKey:m.blobKey||m.id||`${scene.id}-m${i+1}`,prompt:typeof m.prompt==='string'?m.prompt:''}));if(typeof scene.bodyHtml!=='string')scene.bodyHtml='';return scene}
Object.values(state.scenes).forEach(normalizeScene);

let currentMode='grid', currentSceneId='s1', currentChapterId='ch1', searchQuery='';
let currentEpisodeBrowserView='list', episodeBrowserQuery='';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const home=$('#homeScreen'), novel=$('#novelScreen');
function stateForLocalSave(){const copy=JSON.parse(JSON.stringify(state));for(const scene of Object.values(copy.scenes||{})){if(Array.isArray(scene.media))scene.media=scene.media.map(m=>{const x={...m};if(!String(x.src||'').startsWith('data:'))delete x.src;delete x.previewUrl;delete x._file;return x});if(typeof scene.bodyHtml==='string')scene.bodyHtml=sanitizeStoredHtml(scene.bodyHtml)}for(const act of copy.acts||[])for(const ch of act.chapters||[])if(ch.behind)ch.behind.bodyHtml=sanitizeStoredHtml(ch.behind.bodyHtml||'');return copy}

function save(){
  storyAgeCache=null;
  clearTimeout(saveTimer);
  if(storageBlocked){$('#saveState').textContent='기존 저장 데이터를 읽지 못했습니다 · 덮어쓰기 중지';return false}
  try{localStorage.setItem(storageKey(),JSON.stringify(stateForLocalSave()));dirty=false;$('#saveState').textContent='클라우드에 저장 중…';return true}
  catch(e){dirty=true;$('#saveState').textContent='저장 실패 · 저장 공간을 확인하세요';return false}
}
function scheduleSave(){storyAgeCache=null;dirty=true;$('#saveState').textContent='저장 중…';clearTimeout(saveTimer);saveTimer=setTimeout(save,350)}
function flushSave(){return !dirty||save()}
window.libraryFlush=flushSave;
window.addEventListener('pagehide',flushSave);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave()});
window.addEventListener('beforeunload',e=>{if(!flushSave()){e.preventDefault();e.returnValue=''}});
function openNovel(id=DEFAULT_NOVEL_ID){
  if(typeof id!=='string')id=DEFAULT_NOVEL_ID;
  if(mediaBusy){alert('미디어 저장이 끝난 뒤 이동해 주세요.');return}
  if(!flushSave())return;
  observer?.disconnect();
  activeNovelId=id;state=loadNovelState(id);Object.values(state.scenes).forEach(normalizeScene);
  migrateEpisodeSubtitleFields();migrateHierarchyTitles();
  currentChapterId=state.acts[0].chapters[0].id;currentSceneId=state.acts[0].chapters[0].scenes[0];
  mediaUrlCache.clear();clearSelectedInlineMedia();
  searchQuery='';$('#sceneSearch').value='';episodeBrowserQuery='';$('#episodeSearch').value='';
  home.classList.add('hidden-screen');novel.classList.add('open');
  history.replaceState(null,'',`#novel/${encodeURIComponent(id)}`);window.scrollTo(0,0);
  renderNovelIdentity();renderSidebar();renderAll();switchView('episodes');
  $('#saveState').textContent=storageBlocked?'저장 데이터를 읽지 못했습니다 · 덮어쓰기 중지':(window.libraryCloud.unsaved?'클라우드에 저장 중…':'● 클라우드 저장됨');
}
function openHome(){if(!closeCharacterPopup())return;if(!leaveNovelSettings('home'))return;if(mediaBusy){alert('미디어 저장이 끝난 뒤 이동해 주세요.');return}if(!flushSave())return;observer?.disconnect();novel.classList.remove('open');home.classList.remove('hidden-screen');history.replaceState(null,'',location.pathname+location.search);renderCreatedNovels();window.scrollTo(0,0)}
(document.getElementById('homeBackNew')||document.getElementById('homeBack'))?.addEventListener('click',openHome);
function charById(id){return state.characters.find(c=>c.id===id)}
function scenePeriod(scene){return typeof scene.timelineLabel==='string'?scene.timelineLabel:(scene.year==null?'':String(scene.year))}
function scenePeriodLabel(scene){const raw=scenePeriod(scene);if(parseStoryPeriod(raw).kind==='relative')return relativeStoryLabel(scene)||raw+' (누적 미정)';return raw||'시점 미정'}
function parseStoryPeriod(value){
 const text=String(value||'').trim();
 if(!text)return {kind:'unknown'};
 const calendar=text.match(/^(\d{4})(?:년)?(?:\s*(\d{1,2})월)?$/);
 if(calendar){const year=Number(calendar[1]),month=calendar[2]?Number(calendar[2]):1;if(year>=1&&month>=1&&month<=12)return {kind:'calendar',months:year*12+month-1};return {kind:'unknown'}}
 if(/^(첫\s*등장|시작|이야기\s*시작)$/.test(text))return {kind:'start',months:0};
 if(/^(같은\s*(날|시점)|동시)$/.test(text))return {kind:'relative',months:0};
 const relative=text.replace(/\s+/g,'');
 const match=relative.match(/^([+-]?\d+년)?([+-]?\d+(?:개월|달))?(뒤|후|전)?$/);
 if(!match||(!match[1]&&!match[2]))return {kind:'unknown'};
 let years=match[1]?parseInt(match[1],10):0,rest=match[2]?parseInt(match[2],10):0;if(years<0&&match[2]&&!/^[+-]/.test(match[2]))rest=-rest;let months=years*12+rest;
 if(match[3]==='전')months=-Math.abs(months);
 return Number.isSafeInteger(months)?{kind:'relative',months}:{kind:'unknown'};
}
function elapsedPeriod(months){
 if(!Number.isFinite(months))return '경과 미정';
 if(months===0)return '+0달';
 const sign=months<0?'−':'+',total=Math.abs(months),years=Math.floor(total/12),rest=total%12;
 return [years?`${sign}${years}년`:'',rest?`${sign}${rest}달`:''].filter(Boolean).join(' ');
}
function storyClock(scenes){
 const positions=new Map();let previous=null;
 for(const scene of scenes){
  const parsed=parseStoryPeriod(scenePeriod(scene));let position;
  if(parsed.kind==='calendar')position={months:parsed.months,segment:'calendar',kind:parsed.kind};
  else if(parsed.kind==='relative'&&previous)position={months:previous.months+parsed.months,segment:previous.segment,kind:parsed.kind};
  else position={months:parsed.kind==='relative'?parsed.months:0,segment:'relative:'+scene.id,kind:parsed.kind};
  positions.set(scene.id,position);previous=position;
 }
 return positions;
}
function characterInScene(character,scene){return (scene.characters||[]).includes(character.id)||codexMatches(scene.text||'',character).length>0}
function storyAgeContext(){
 if(storyAgeCache)return storyAgeCache;
 const scenes=orderedSceneIds().map(id=>state.scenes[id]),clock=storyClock(scenes),first=new Map(),present=new Map();
 for(const scene of scenes){const ids=[...(scene.characters||[])];for(const c of state.characters){if(characterInScene(c,scene)){if(!ids.includes(c.id))ids.push(c.id);if(!first.has(c.id))first.set(c.id,scene.id)}}present.set(scene.id,ids)}
 return storyAgeCache={scenes,clock,first,present};
}
function sceneCharacterIds(scene){return storyAgeContext().present.get(scene.id)||scene.characters||[]}
function relativeStoryLabel(scene){
 const {scenes,clock}=storyAgeContext(),current=clock.get(scene.id),beginning=clock.get(scenes[0]?.id);
 if(!current||!beginning||current.segment!==beginning.segment)return null;
 return elapsedPeriod(current.months-(beginning.kind==='relative'?0:beginning.months));
}
function characterAgeLabel(charId,scene){
 const character=charById(charId);if(!character)return '';
 const {scenes,clock,first}=storyAgeContext(),current=clock.get(scene.id);
 const start=clock.get(first.get(charId));
 if(!current)return '시점 미정';
 if(current.kind==='calendar'){
  const specified=character.firstYear!==null&&character.firstYear!==undefined&&String(character.firstYear).trim()!==''?Number(character.firstYear):NaN;
  const origin=Number.isInteger(specified)&&specified>0?specified*12:start?.segment==='calendar'?start.months:null;
  if(origin===null)return '첫등장 연도 미정';
  if(character.baseAge==null||String(character.baseAge).trim()==='')return '첫등장 나이 미정';
  const ageMonths=Number(character.baseAge)*12+current.months-origin;
  if(!Number.isFinite(ageMonths)||ageMonths<0)return '나이 확인 필요';
  const years=Math.floor(ageMonths/12),months=ageMonths%12;
  return `${years}세${months?' '+months+'개월':''}`;
 }
 if(current.kind==='unknown')return '경과 미정';
 const beginning=clock.get(scenes[0]?.id);
 if(!beginning||beginning.segment!==current.segment)return '경과 기준 미정';
 return elapsedPeriod(current.months-(beginning.kind==='relative'?0:beginning.months));
}

function ageText(scene){return sceneCharacterIds(scene).map(id=>escapeHtml(charById(id)?.name||'알 수 없는 인물')+' ('+escapeHtml(characterAgeLabel(id,scene))+')').join(' · ')}
function characterNames(scene){return sceneCharacterIds(scene).map(id=>charById(id)?.name).filter(Boolean).join(' · ')}
function preview(t,n=70){const x=(t||'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n)+'…':x}
function chapterForScene(id){for(const act of state.acts)for(const ch of act.chapters)if(ch.scenes.includes(id))return ch;return null}
function actForChapter(id){return state.acts.find(a=>a.chapters.some(c=>c.id===id))}
function orderedSceneIds(){return state.acts.flatMap(a=>a.chapters.flatMap(c=>c.scenes))}
function allEpisodeGroups(){return state.acts}
function allCards(){return state.acts.flatMap(a=>a.chapters)}
function episodeForCard(cardId){return state.acts.find(a=>a.chapters.some(c=>c.id===cardId))||null}
function splitLegacyEpisodeTitle(raw){
  const text=String(raw||'').trim();
  const m=text.match(/^(에피소드\s*\d+)(?:\s*[:：\-–—]\s*(.+))?$/);
  return m?{title:m[1],subtitle:(m[2]||'').trim()}:{title:text,subtitle:''};
}
function migrateEpisodeSubtitleFields(){
  state.acts.forEach((act,i)=>{
    if(typeof act.subtitle!=='string'){
      const parts=splitLegacyEpisodeTitle(act.title||`에피소드 ${i+1}`);
      act.title=parts.title||`에피소드 ${i+1}`;
      act.subtitle=parts.subtitle||'';
    }
  });
}
migrateEpisodeSubtitleFields();
function writeEpisodeParts(act){
  return {label:String(act?.title||'').trim(),subtitle:String(act?.subtitle||'').trim()};
}

function migrateHierarchyTitles(){
  state.acts.forEach((act,ai)=>{
    const at=(act.title||'').trim();
    if(!at || /^Act\b/i.test(at) || at==='에피소드') act.title=`에피소드 ${ai+1}`;
  });
  let n=1;
  for(const act of state.acts){
    for(const ch of act.chapters){
      const ct=(ch.title||'').trim();
      if(!ct || /^Chapter\b/i.test(ct) || /^에피소드\s*\d+$/i.test(ct)) ch.title=String(n).padStart(3,'0');
      n++;
    }
  }
}
migrateHierarchyTitles();
function updateEpisodeGroupTitle(id,value){
  const act=state.acts.find(a=>a.id===id); if(!act)return;
  act.title=(value||'').trim()||'제목 없음';
  save(); renderAllPlan(); renderGallery(); renderWriteChapterMenu(); updateWriteNavLabel();
  if(currentChapterId && episodeForCard(currentChapterId)?.id===id && !$('#writeView').classList.contains('hidden')) renderWriteChapter(currentChapterId,currentSceneId);
}
function updateEpisodeGroupSubtitle(id,value){
  const act=state.acts.find(a=>a.id===id); if(!act)return;
  act.subtitle=(value||'').trim();
  save(); renderAllPlan(); renderGallery(); renderWriteChapterMenu(); updateWriteNavLabel();
  if(currentChapterId && episodeForCard(currentChapterId)?.id===id && !$('#writeView').classList.contains('hidden')) renderWriteChapter(currentChapterId,currentSceneId);
}
function updateCardTitle(id,value){
  const ch=allCards().find(x=>x.id===id); if(!ch)return;
  ch.title=(value||'').trim()||'000';
  save(); renderAllPlan(); renderGallery();
  if(currentChapterId===id && !$('#writeView').classList.contains('hidden')) renderWriteChapter(id,currentSceneId);
}
function bindHierarchyTitleInputs(){
  $$('[data-episode-group-title]').forEach(inp=>{
    inp.addEventListener('click',e=>e.stopPropagation());
    inp.addEventListener('change',()=>updateEpisodeGroupTitle(inp.dataset.episodeGroupTitle,inp.value));
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur()}});
  });
  $$('[data-episode-group-subtitle]').forEach(inp=>{
    inp.addEventListener('click',e=>e.stopPropagation());
    inp.addEventListener('change',()=>updateEpisodeGroupSubtitle(inp.dataset.episodeGroupSubtitle,inp.value));
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur()}});
  });
  $$('[data-card-title]').forEach(inp=>{
    inp.addEventListener('click',e=>e.stopPropagation());
    inp.addEventListener('change',()=>updateCardTitle(inp.dataset.cardTitle,inp.value));
    inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inp.blur()}});
  });
}
function mediaExt(m){
  const name=(m.name||'').trim();
  const mm=name.match(/\.([a-z0-9]{2,5})$/i);
  if(mm)return mm[1].toUpperCase();
  if(m.type==='gif')return 'GIF';
  if(m.type==='video')return 'MP4';
  return 'JPG';
}
function renderGalleryEpisodeOptions(){
  const sel=$('#galleryEpisode'); if(!sel)return;
  const keep=sel.value||'all';
  sel.innerHTML='<option value="all">전체 에피소드</option>'+state.acts.map(act=>`<option value="${act.id}">${escapeHtml(act.title)}</option>`).join('');
  sel.value=[...sel.options].some(o=>o.value===keep)?keep:'all';
}

function findMediaById(mediaId){return allMediaRecords().find(item=>item.media.id===mediaId)||null}
let selectedInlineMediaId=null;
function clearSelectedInlineMedia(){
  selectedInlineMediaId=null;
  $$('[data-inline-media].selected-media').forEach(el=>el.classList.remove('selected-media'));
}
function selectInlineMedia(mediaId,figure){
  clearSelectedInlineMedia();
  selectedInlineMediaId=mediaId;
  if(figure)figure.classList.add('selected-media');
}
async function deleteMediaById(mediaId){
  const found=findMediaById(mediaId); if(!found)return;
  const {sceneId,scene,media}=found;
  if(mediaBusy)return;
  mediaBusy=true;
  try{const key=media.blobKey||media.id;if(!mediaBlobIsShared(mediaId,key))await idbDelete(key)}catch(e){mediaBusy=false;$('#saveState').textContent='미디어 삭제 실패 · 다시 시도해 주세요';return}
  mediaBusy=false;
  scene.media=scene.media.filter(m=>m.id!==mediaId);
  if(scene.bodyHtml){
    const t=document.createElement('template');
    t.innerHTML=scene.bodyHtml;
    const fig=t.content.querySelector(`[data-inline-media="${mediaId}"]`);
    if(fig)fig.remove();
    scene.bodyHtml=t.innerHTML;
  }
  const old=mediaUrlCache.get(media.id);
  if(old&&String(old).startsWith('blob:')){try{URL.revokeObjectURL(old)}catch(e){}}
  mediaUrlCache.delete(media.id);
  save();
  clearSelectedInlineMedia();
  if(currentChapterId&&found.source!=='behind')renderWriteChapter(currentChapterId,sceneId);
  renderAllPlan();renderGallery();
}
let promptEditingMediaId=null;
async function openPromptEditor(mediaId){const found=findMediaById(mediaId);if(!found||found.media.type==='video')return;promptEditingMediaId=mediaId;$('#promptPreviewImage').src=await mediaObjectUrl(found.media);$('#promptText').value=found.media.prompt||'';$('#promptModalBackdrop').classList.remove('hidden');setTimeout(()=>$('#promptText').focus(),0)}
function closePromptEditor(){promptEditingMediaId=null;$('#promptModalBackdrop').classList.add('hidden')}
function savePromptEditor(){const found=findMediaById(promptEditingMediaId);if(!found)return closePromptEditor();found.media.prompt=$('#promptText').value.trim();save();renderGallery();closePromptEditor()}
let galleryPreviewMediaId=null;
async function openGalleryPreview(mediaId){const found=findMediaById(mediaId);if(!found||found.media.type==='video')return;galleryPreviewMediaId=mediaId;$('#galleryPreviewImage').src=await mediaObjectUrl(found.media);const p=(found.media.prompt||'').trim();$('#galleryPreviewPrompt').innerHTML=`<b>AI 생성 프롬프트</b>${p?escapeHtml(p):'<span style="color:#888">저장된 프롬프트 없음</span>'}`;$('#galleryPreviewPrompt').innerHTML+=`<hr><b>태그</b>${escapeHtml((found.media.tags||[]).join(', ')||'없음')}<br><b>설명</b>${escapeHtml(found.media.description||'없음')}`;$('#galleryPreviewBackdrop').classList.remove('hidden')}
function closeGalleryPreview(){galleryPreviewMediaId=null;$('#galleryPreviewBackdrop').classList.add('hidden')}


function chapterTitleForBrowser(ch){
  const first=state.scenes[ch.scenes[0]];
  if(first && first.title && !/^Scene\s*\d+$/i.test(first.title)) return first.title;
  const act=episodeForCard(ch.id);
  return act?.subtitle || act?.title || ch.title;
}

function sceneSummaryForCard(scene){
  const goal=(scene.goal||'').trim();
  if(goal)return goal;
  const text=(scene.text||'').replace(/\s+/g,' ').trim();
  return text.length>170?text.slice(0,170)+'…':text||'요약이 아직 없습니다.';
}
function chapterSummary(ch,full=false){
  const scenes=ch.scenes.map(id=>state.scenes[id]).filter(Boolean);
  const goals=scenes.map(s=>(s.goal||'').trim()).filter(Boolean);
  const texts=scenes.map(s=>(s.text||'').replace(/\s+/g,' ').trim()).filter(Boolean);
  let summary=goals.join(' ');
  if(!summary) summary=texts.join(' ');
  if(!full && summary.length>120) summary=summary.slice(0,120)+'…';
  return summary || '요약이 아직 없습니다.';
}
function chapterWordCount(ch){return ch.scenes.map(id=>(state.scenes[id]?.text||'').replace(/\s/g,'').length).reduce((a,b)=>a+b,0)}
function episodeBrowserMatches(ch){
  if(!episodeBrowserQuery)return true;
  const act=episodeForCard(ch.id);
  const hay=[ch.title,chapterTitleForBrowser(ch),chapterSummary(ch,true),act?.title,act?.subtitle].join(' ').toLowerCase();
  return hay.includes(episodeBrowserQuery.toLowerCase());
}
function openChapterFromEpisodes(chId){
  const ch=allCards().find(c=>c.id===chId);if(!ch)return;
  currentChapterId=ch.id;currentSceneId=ch.scenes[0]||currentSceneId;switchView('write');
  requestAnimationFrame(()=>document.getElementById('write-'+currentSceneId)?.scrollIntoView({behavior:'smooth',block:'start'}))
}
function renderEpisodesBrowser(){
  const list=$('#episodeListView'),cards=$('#episodeCardView');if(!list||!cards)return;
  const toolbar=$('#episodesView .episode-browser-top');
  if(toolbar&&!$('#infoAddEpisode')){const button=document.createElement('button');button.id='infoAddEpisode';button.type='button';button.className='behind-open';button.textContent='＋ 에피소드 추가';toolbar.insertBefore(button,$('#episodeSearch'));button.onclick=()=>addFromInfo('episode')}
  let listHtml='',cardHtml='';
  for(const act of state.acts){
    const chapters=act.chapters.filter(episodeBrowserMatches);
    if(!chapters.length&&episodeBrowserQuery)continue;
    const label=`${act.title}${act.subtitle?': '+act.subtitle:''}`;
    listHtml+=`<section class="episode-section"><div class="episode-section-head"><b>${escapeHtml(label)}</b><button type="button" class="behind-open" style="margin-left:auto" data-info-add-chapter="${escapeAttr(act.id)}">＋ 회차 추가</button></div><div class="episode-list">${chapters.map(ch=>{
      const wc=chapterWordCount(ch);
      const rating='—';
      const published='—';
      const updated='—';
      return `<article class="episode-row" data-open-chapter="${ch.id}">
        <div class="episode-row-no">${escapeHtml(ch.title)}</div>
        <div class="episode-row-main">
          <div class="episode-row-title">${escapeHtml(chapterTitleForBrowser(ch))}</div>
          <div class="episode-row-summary">${escapeHtml(chapterSummary(ch,false))}</div>
        </div>
        <div class="episode-row-meta">
          ${behindButton(ch)}
          <span><span class="purple">A</span>${wc.toLocaleString()}자</span>


        </div>
      </article>`
    }).join('')}</div></section>`;
    cardHtml+=`<section class="episode-section"><div class="episode-section-head"><b>${escapeHtml(label)}</b><button type="button" class="behind-open" style="margin-left:auto" data-info-add-chapter="${escapeAttr(act.id)}">＋ 회차 추가</button></div><div class="episode-card-grid">${chapters.map(ch=>{
      const sceneRows=ch.scenes.map(id=>state.scenes[id]).filter(Boolean).map(s=>`<div class="scene-summary-item"><div class="scene-summary-name">${escapeHtml(s.title)}</div><div class="scene-summary-text">${escapeHtml(sceneSummaryForCard(s))}</div></div>`).join('');
      return `<article class="episode-card" data-open-chapter="${ch.id}">
        <div class="episode-card-head"><span class="episode-card-no">${escapeHtml(ch.title)}</span><span class="episode-card-title">${escapeHtml(chapterTitleForBrowser(ch))}</span></div>
        <div class="scene-summary-list">${sceneRows}</div>
        <div class="episode-card-foot"><span>${chapterWordCount(ch).toLocaleString()}자</span><span>${ch.scenes.length} scenes</span>${behindButton(ch)}</div>
      </article>`
    }).join('')}</div></section>`;
  }
  list.innerHTML=listHtml||'<div style="padding:24px;color:#999;font-size:12px">검색 결과가 없습니다.</div>';
  cards.innerHTML=cardHtml||'<div style="padding:24px;color:#999;font-size:12px">검색 결과가 없습니다.</div>';
  $$('[data-open-chapter]').forEach(el=>el.addEventListener('click',e=>{if(!e.target.closest('[data-behind-open]'))openChapterFromEpisodes(el.dataset.openChapter)}));
  $$('[data-behind-open]').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();openBehind(button.dataset.behindOpen)}));
  $$('[data-info-add-chapter]').forEach(button=>button.onclick=()=>addFromInfo('chapter',button.dataset.infoAddChapter));
  setEpisodeBrowserView(currentEpisodeBrowserView);
}
function addFromInfo(kind,parentId){if(!flushSave())return;episodeBrowserQuery='';$('#episodeSearch').value='';addStructure(kind,parentId)}
function setEpisodeBrowserView(view){
  currentEpisodeBrowserView=view;
  $$('[data-episode-view]').forEach(b=>b.classList.toggle('active',b.dataset.episodeView===view));
  $('#episodeListView')?.classList.toggle('hidden',view!=='list');
  $('#episodeCardView')?.classList.toggle('hidden',view!=='card');
}
function matches(scene){if(!searchQuery)return true;const hay=[scene.title,scene.text,scene.location,scene.pov,characterNames(scene),scenePeriodLabel(scene)].join(' ').toLowerCase();return hay.includes(searchQuery.toLowerCase())}
function sceneCard(scene){return `<article class="scene-card" data-open-scene="${scene.id}"><div class="scene-top"><span>${escapeHtml(scene.title)}</span><span>✎ ⋮</span></div><div class="scene-meta">${escapeHtml(scenePeriodLabel(scene))} · ${escapeHtml(scene.time)} · ${escapeHtml(scene.location)}<br>${ageText(scene)}</div><p>${escapeHtml(preview(scene.text))}</p><div class="chips">${scene.characters.map(id=>`<span class="chip">${escapeHtml(charById(id)?.name||'')}</span>`).join('')}<span class="chip">${escapeHtml(scene.location)}</span>${mediaSummary(scene)}</div></article>`}
function mediaSummary(scene){const count=(scene.media||[]).length;return count?`<span class="chip">삽화 ${count}</span>`:''}
function renderSceneMedia(scene){return ''}
const mediaUrlCache=new Map();
async function openMediaDb(){return null}
async function idbPut(key,blob){return window.libraryCloud.putMedia(key,blob)}
async function idbGet(key){return window.libraryCloud.getMedia(key)}
async function idbDelete(key){window.libraryCloud.removeMedia(key)}
function blobToDataUrl(blob){return new Promise((resolve,reject)=>{try{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsDataURL(blob)}catch(e){reject(e)}})}
function dataUrlToBlob(src){try{const [head,data]=src.split(',',2);const mime=(head.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';if(/;base64/i.test(head)){const bin=atob(data);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime})}return new Blob([decodeURIComponent(data)],{type:mime})}catch(e){return null}}
async function mediaObjectUrl(m){if(!m)return'';try{const cached=mediaUrlCache.get(m.id);if(cached&&String(cached).startsWith('data:'))return cached;let blob=null;if(m.src&&m.src.startsWith('data:')){blob=dataUrlToBlob(m.src);if(blob){await idbPut(m.blobKey||m.id,blob);delete m.src;save()}}if(!blob)blob=await idbGet(m.blobKey||m.id);if(!blob)return'';const u=await blobToDataUrl(blob);mediaUrlCache.set(m.id,u);return u}catch(e){console.error('mediaObjectUrl failed',m?.id,e);return''}}
function sanitizeStoredHtml(html){const t=document.createElement('template');t.innerHTML=window.cleanLibraryHTML(html||'');t.content.querySelectorAll('[data-inline-media] img,[data-inline-media] video').forEach(el=>{el.removeAttribute('src');el.setAttribute('data-media-src','1')});return t.innerHTML}
async function hydrateMediaSources(root=document){const els=[...root.querySelectorAll('[data-media-id]')];await Promise.all(els.map(async el=>{const found=findMediaById(el.dataset.mediaId);if(!found)return;const url=await mediaObjectUrl(found.media);if(url){el.src=url;el.classList.remove('media-missing');const miss=el.parentElement?.querySelector('.inline-missing');if(miss)miss.remove()}else{el.removeAttribute('src');el.classList.add('media-missing');if(el.closest('.inline-figure')&&!el.parentElement.querySelector('.inline-missing')){const msg=document.createElement('div');msg.className='inline-missing';msg.textContent='이미지 원본을 불러오지 못했습니다. 이 삽화를 다시 드래그해 연결해 주세요.';el.insertAdjacentElement('afterend',msg)}}}))}
async function migrateLegacyMedia(){const source=state;let changed=false;for(const scene of Object.values(source.scenes||{})){normalizeScene(scene);for(const m of scene.media){if(m.src&&m.src.startsWith('data:')){const blob=dataUrlToBlob(m.src);if(blob){await idbPut(m.blobKey||m.id,blob);delete m.src;changed=true}}}if(typeof scene.bodyHtml==='string'){const clean=sanitizeStoredHtml(scene.bodyHtml);if(clean!==scene.bodyHtml){scene.bodyHtml=clean;changed=true}}}if(changed&&state===source)save()}
function mediaType(file){const n=(file.name||'').toLowerCase();if((file.type||'').startsWith('video/'))return 'video';if(file.type==='image/gif'||n.endsWith('.gif'))return 'gif';return 'image'}
async function sha256Buffer(buf){if(!window.crypto?.subtle)return null;const digest=await crypto.subtle.digest('SHA-256',buf);return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}
async function hashFile(file){try{return await sha256Buffer(await file.arrayBuffer())}catch(e){return null}}
function dataUrlToBytes(src){try{const comma=src.indexOf(',');if(comma<0)return null;const meta=src.slice(0,comma),data=src.slice(comma+1);if(/;base64/i.test(meta)){const bin=atob(data);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer}return new TextEncoder().encode(decodeURIComponent(data)).buffer}catch(e){return null}}
async function ensureMediaHash(m){if(m.hash)return m.hash;let buf=null;if(m.src){buf=dataUrlToBytes(m.src)}else{const blob=await idbGet(m.blobKey||m.id);if(blob)buf=await blob.arrayBuffer()}if(!buf)return null;m.hash=await sha256Buffer(buf);return m.hash}
async function findDuplicateImage(hash){if(!hash)return null;for(const item of allMediaRecords()){if(item.media.type!=='video'&&await ensureMediaHash(item.media)===hash)return item}return null}
let dupResolver=null;function showDuplicateModal(item,dup){return new Promise(resolve=>{dupResolver=resolve;$('#dupPreview').src=item.previewUrl||'';$('#dupLocationTitle').textContent=`${dup.chapter?.title||'회차'} · ${dup.source==='behind'?'비하인드':dup.scene.title}`;$('#dupLocationMeta').textContent=dup.source==='behind'?'회차 비하인드에 저장된 이미지':`${scenePeriodLabel(dup.scene)} · ${dup.scene.time} · ${dup.scene.location}`;$('#dupModalBackdrop').classList.remove('hidden');$('#dupGo').onclick=()=>finishDup('go');$('#dupGoLink').onclick=()=>finishDup('go');$('#dupInsertAnyway').onclick=()=>finishDup('insert');$('#dupCancel').onclick=()=>finishDup('cancel')})}
function finishDup(choice){$('#dupModalBackdrop').classList.add('hidden');const r=dupResolver;dupResolver=null;if(r)r(choice)}
function goToExistingMedia(dup){if(dup.source==='behind'){openBehind(dup.chapter.id);return}openScene(dup.sceneId);setTimeout(()=>{const mediaEl=document.querySelector(`[data-inline-media="${dup.media.id}"]`);const sceneEl=document.getElementById('write-'+dup.sceneId);(mediaEl||sceneEl)?.scrollIntoView({behavior:'smooth',block:'center'})},120)}
function fileToMediaMeta(file,sceneId,hash=null){const id=`${sceneId}-m-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;return {id,blobKey:id,type:mediaType(file),name:file.name||'파일',hash,prompt:''}}
async function addFilesToScene(sceneId,fileList,opts={}){
  if(mediaBusy)return;
  mediaBusy=true;
  try{await insertFilesToScene(sceneId,fileList,opts)}catch(e){$('#saveState').textContent='미디어 저장 실패 · 다시 시도해 주세요'}finally{mediaBusy=false}
}
async function insertFilesToScene(sceneId,fileList,opts={}){
  const scene=normalizeScene(state.scenes[sceneId]);if(!scene)return;
  const files=[...(fileList||[])];if(!files.length)return;
  const accepted=[];
  for(const file of files){
    const type=mediaType(file);let hash=null,dup=null;
    if(type!=='video')hash=await hashFile(file);
    const item=fileToMediaMeta(file,sceneId,hash);item.previewUrl=await blobToDataUrl(file);
    if(type!=='video')dup=accepted.find(m=>m.hash&&m.hash===hash)?{sceneId,scene,media:accepted.find(m=>m.hash===hash),chapter:chapterForScene(sceneId)}:await findDuplicateImage(hash);
    if(dup){const choice=await showDuplicateModal(item,dup);if(choice==='go'){goToExistingMedia(dup);continue}if(choice==='cancel'){continue}}
    const storedBlob=file instanceof Blob?file.slice(0,file.size,file.type||'application/octet-stream'):file;await idbPut(item.blobKey,storedBlob);mediaUrlCache.set(item.id,item.previewUrl);delete item.previewUrl;accepted.push(item)
  }
  if(!accepted.length){save();return}
  scene.media=(scene.media||[]).concat(accepted);
  if(opts.inline){accepted.forEach(m=>insertMediaHtml(sceneId,m,opts.range))}
  save();renderWriteChapter(currentChapterId,sceneId);renderAllPlan();renderInfo(sceneId);renderGallery();requestAnimationFrame(()=>hydrateMediaSources(document).catch(console.error))
}
const savedRanges={};
function rememberRange(sceneId){const sel=window.getSelection();if(!sel||!sel.rangeCount)return;const ed=document.querySelector(`[data-editor="${sceneId}"]`);if(ed&&ed.contains(sel.anchorNode))savedRanges[sceneId]=sel.getRangeAt(0).cloneRange()}
function inlineHtml(m){if(m.type==='video')return `<figure class="inline-figure" contenteditable="false" data-inline-media="${m.id}"><video class="inline-video" controls preload="metadata" data-media-id="${m.id}"></video><figcaption>${escapeHtml(m.name||'동영상')}</figcaption></figure><p><br></p>`;return `<figure class="inline-figure" contenteditable="false" data-inline-media="${m.id}"><img class="inline-media" data-media-id="${m.id}" alt=""><figcaption>${escapeHtml(m.name||'삽화')}</figcaption></figure><p><br></p>`}
function insertMediaHtml(sceneId,m,range){const ed=document.querySelector(`[data-editor="${sceneId}"]`);if(!ed)return;ed.focus();let r=range||savedRanges[sceneId];if(!r||!ed.contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents(ed);r.collapse(false)}const temp=document.createElement('div');temp.innerHTML=inlineHtml(m);const frag=document.createDocumentFragment();let node,last;while((node=temp.firstChild)){last=frag.appendChild(node)}r.deleteContents();r.insertNode(frag);if(last){r.setStartAfter(last);r.collapse(true);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(r);savedRanges[sceneId]=r.cloneRange()}syncEditor(sceneId)}
function syncEditor(sceneId){const ed=document.querySelector(`[data-editor="${sceneId}"]`);const s=state.scenes[sceneId];if(!ed||!s)return;s.bodyHtml=sanitizeStoredHtml(ed.innerHTML);s.text=ed.innerText;scheduleSave()}
function caretRangeAtPoint(ed,x,y){
  let r=null;
  if(document.caretRangeFromPoint){r=document.caretRangeFromPoint(x,y)}
  else if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);if(p){r=document.createRange();r.setStart(p.offsetNode,p.offset);r.collapse(true)}}
  if(!r||!ed.contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents(ed);r.collapse(false)}
  return r
}
function bindMediaControls(){
  $$('[data-editor]').forEach(ed=>{
    const id=ed.dataset.editor;
    ['dragenter','dragover'].forEach(ev=>ed.addEventListener(ev,e=>{
      if(!e.dataTransfer||![...e.dataTransfer.items||[]].some(i=>i.kind==='file'))return;
      e.preventDefault();e.dataTransfer.dropEffect='copy';ed.classList.add('drag-media')
    }));
    ['dragleave','dragend'].forEach(ev=>ed.addEventListener(ev,()=>ed.classList.remove('drag-media')));
    ed.addEventListener('drop',e=>{
      const files=[...(e.dataTransfer?.files||[])].filter(f=>(f.type||'').startsWith('image/')||(f.type||'').startsWith('video/')||/\.gif$/i.test(f.name||''));
      if(!files.length)return;
      e.preventDefault();ed.classList.remove('drag-media');
      const range=caretRangeAtPoint(ed,e.clientX,e.clientY);
      savedRanges[id]=range.cloneRange();
      addFilesToScene(id,files,{inline:true,range})
    })
  })
}
function renderGallery(){
  const grid=$('#galleryGrid'); if(!grid)return;
  renderGalleryEpisodeOptions();
  const selected=$('#galleryEpisode')?.value||'all';
  const source=$('#gallerySource')?.value||'all';
  const episodes=selected==='all'?state.acts:state.acts.filter(act=>act.id===selected);
  let html='';
  for(const act of episodes){
    let cards='';
    for(const ch of act.chapters){
      for(const id of (source==='behind'?[]:ch.scenes)){
        const s=normalizeScene(state.scenes[id]);
        for(const m of s.media){
          cards+=`<article class="gallery-card"><div class="gallery-thumbnail"><span class="media-ext">${mediaExt(m)}</span>${m.type==='video'?`<video controls preload="metadata" data-media-id="${m.id}"></video>`:`<img data-media-id="${m.id}" alt="${escapeAttr(m.name||'삽화')}" data-gallery-preview="${m.id}">`}</div><div class="meta"><b>본편 · ${escapeHtml(ch.title)} · ${s.title}</b>${escapeHtml(m.name||'삽화')}<br>${escapeHtml(scenePeriodLabel(s))} · ${s.location}</div><button type="button" class="gallery-jump" data-gallery-go="${id}" title="해당 회차로 이동">↗</button></article>`;
        }
      }
      if(source!=='episode')for(const m of ch.behind?.media||[]){cards+=`<article class="gallery-card"><div class="gallery-thumbnail"><span class="media-source">비하인드</span><span class="media-ext">${mediaExt(m)}</span><img data-media-id="${escapeAttr(m.id)}" data-gallery-preview="${escapeAttr(m.id)}" alt="${escapeAttr(m.name||'비하인드 이미지')}"></div><div class="meta"><b>비하인드 · ${escapeHtml(ch.title)}</b>${escapeHtml(m.name||'')}<p>${escapeHtml(m.description||'')}</p><span>${escapeHtml((m.tags||[]).join(' · '))}</span></div><button type="button" class="gallery-jump" data-gallery-behind="${escapeAttr(ch.id)}" title="비하인드 보기">↗</button></article>`}
    }
    html+=`<section class="gallery-episode"><h3>${escapeHtml(act.title)}${act.subtitle?`<span style="display:block;font-size:11px;font-weight:500;color:#777;margin-top:3px">${escapeHtml(act.subtitle)}</span>`:''}</h3>${cards?`<div class="gallery-episode-grid">${cards}</div>`:'<div style="font-size:12px;color:#999;padding:4px 0 8px">이 에피소드에는 미디어가 없습니다.</div>'}</section>`;
  }
  grid.innerHTML=html||'<div style="font-size:12px;color:#999;padding:12px">표시할 미디어가 없습니다.</div>';
  $$('[data-gallery-preview]').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openGalleryPreview(el.dataset.galleryPreview)}));
  $$('[data-gallery-go]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openScene(btn.dataset.galleryGo)}));$$('[data-gallery-behind]').forEach(button=>button.onclick=()=>openBehind(button.dataset.galleryBehind));hydrateMediaSources(grid);
}
function renderGrid(){
  let html='<div class="plan-add-actions"><button type="button" id="addEpisode">＋ 에피소드</button></div>';
  for(const act of state.acts){
    const chapterHtml=act.chapters.map(ch=>{
      const cards=ch.scenes.map(id=>state.scenes[id]).filter(matches).map(sceneCard).join('');
      if(!cards&&searchQuery)return '';
      return `<div class="chapter"><div class="chapter-head"><input class="card-title-input" data-card-title="${ch.id}" value="${escapeAttr(ch.title)}" aria-label="카드 제목"></div>${cards||'<div style="font-size:11px;color:#999;padding:8px">(No content)</div>'}<button class="add-scene" data-add-scene="${ch.id}">＋ Scene</button></div>`;
    }).join('');
    if(!chapterHtml&&searchQuery)continue;
    html+=`<div class="act-block"><div class="act-title"><h2><span class="episode-group-fields"><input class="episode-group-input" data-episode-group-title="${act.id}" value="${escapeAttr(act.title)}" aria-label="에피소드 제목"><input class="episode-subtitle-input" data-episode-group-subtitle="${act.id}" value="${escapeAttr(act.subtitle||'')}" placeholder="부제" aria-label="에피소드 부제"></span></h2><span>${act.chapters.length} 회차 <button type="button" data-add-chapter="${act.id}">＋ 회차</button></span></div><div class="chapter-grid">${chapterHtml}</div></div>`;
  }
  $('#gridMode').innerHTML=window.cleanLibraryTemplate(html)||'<p>검색 결과가 없습니다.</p>';
  bindHierarchyTitleInputs();
  $('#addEpisode').onclick=()=>addStructure('episode');
  $$('[data-add-chapter]').forEach(b=>b.onclick=()=>addStructure('chapter',b.dataset.addChapter));
  $$('[data-add-scene]').forEach(b=>b.onclick=()=>addStructure('scene',b.dataset.addScene));
}

function addStructure(kind,parentId){
  const uid=()=>crypto.randomUUID();
  const sceneId=uid();
  const scene={...blankState().scenes.s1,id:sceneId};
  const chapter={id:uid(),title:String(allCards().length+1).padStart(3,'0'),scenes:[sceneId]};
  if(kind==='episode')state.acts.push({id:uid(),title:`에피소드 ${state.acts.length+1}`,subtitle:'',chapters:[chapter]});
  else if(kind==='chapter'){const act=state.acts.find(a=>a.id===parentId);if(!act)return;act.chapters.push(chapter)}
  else{const ch=allCards().find(c=>c.id===parentId);if(!ch)return;scene.title=`Scene ${ch.scenes.length+1}`;ch.scenes.push(sceneId)}
  state.scenes[sceneId]=scene;save();renderAll();
}

function renderMatrix(){const chars=state.characters;const cols=`150px repeat(${chars.length}, minmax(200px,1fr))`;let html=`<div class="matrix-wrap"><div class="matrix-grid" style="grid-template-columns:${cols}"><div class="mcell mhead"></div>${chars.map(c=>`<div class="mcell mhead"><div class="avatar">${c.avatar}</div><div><b>${c.name}</b>${c.baseAge==null?'':`<div style="font-size:9px;color:#888">첫등장 ${c.baseAge}세</div>`}</div></div>`).join('')}`;for(const id of orderedSceneIds()){const s=state.scenes[id];if(!matches(s))continue;const ch=chapterForScene(id),act=episodeForCard(ch.id);html+=`<div class="mcell rowlabel"><b>${act?.title||''} · ${ch.title}</b><br>${s.title}<br><span style="color:#999">${escapeHtml(scenePeriodLabel(s))} · ${s.time}</span></div>`;for(const c of chars){html+=`<div class="mcell">${sceneCharacterIds(s).includes(c.id)?`<div class="matrix-card" data-open-scene="${s.id}"><b>${s.title} · ${escapeHtml(scenePeriodLabel(s))}</b><p>${preview(s.text,50)}</p><div class="chip" style="display:inline-block;margin-top:5px">${escapeHtml(characterAgeLabel(c.id,s))}</div></div>`:''}</div>`}}html+='</div></div>';$('#matrixMode').innerHTML=window.cleanLibraryTemplate(html)}
function renderOutline(){
  let html='<div class="outline">';
  for(const act of state.acts){
    let inside='';
    for(const ch of act.chapters){
      const scenes=ch.scenes.map(id=>state.scenes[id]).filter(matches);
      if(!scenes.length&&searchQuery)continue;
      inside+=`<div class="outline-ch"><h3><input class="card-title-input" data-card-title="${ch.id}" value="${escapeAttr(ch.title)}" aria-label="카드 제목"></h3>${scenes.map(s=>`<div class="outline-scene" data-open-scene="${s.id}"><strong>${s.title}</strong> — ${preview(s.text,120)}<span class="outline-meta">${escapeHtml(scenePeriodLabel(s))} · ${s.time} · ${s.location} · ${ageText(s)}</span></div>`).join('')}</div>`;
    }
    if(inside) html+=`<div class="outline-act"><h2><span class="episode-group-fields"><input class="episode-group-input" data-episode-group-title="${act.id}" value="${escapeAttr(act.title)}" aria-label="에피소드 제목"><input class="episode-subtitle-input" data-episode-group-subtitle="${act.id}" value="${escapeAttr(act.subtitle||'')}" placeholder="부제" aria-label="에피소드 부제"></span></h2>${inside}</div>`;
  }
  html+='</div>';
  $('#outlineMode').innerHTML=window.cleanLibraryTemplate(html);
  bindHierarchyTitleInputs();
}
function renderTimeline(){
 const scenes=orderedSceneIds().map(id=>state.scenes[id]).filter(matches);
 $('#timelineMode').innerHTML=`<div class="timeline"><div class="timeline-note">연도 입력 시 나이를 계산합니다. ‘1년 뒤’, ‘+2달’은 이전 장면에서 누적하며, 연도가 없는 장면은 이야기 시작부터 경과 시간을 표시합니다. 중간 장면의 시점이 미정이면 이후의 누적 계산을 보류합니다. 같은 시점은 ‘같은 날’로 적으세요.</div>${scenes.map(scene=>{const ch=chapterForScene(scene.id),act=episodeForCard(ch.id);return `<section class="year-block"><div class="year-label"><h2>${escapeHtml(scenePeriodLabel(scene))}</h2></div><div class="timeline-list"><article class="timeline-card" data-open-scene="${escapeAttr(scene.id)}"><div><h3>${escapeHtml(act?.title||'')} · ${escapeHtml(ch.title)} · ${escapeHtml(scene.title)}</h3><p>${escapeHtml(preview(scene.text,95))}</p><div class="timeline-age">${escapeHtml(scene.time)} · ${escapeHtml(scene.location)}<br>${ageText(scene)}</div></div><div class="year-edit"><input type="text" value="${escapeAttr(scenePeriod(scene))}" data-period-input="${escapeAttr(scene.id)}" aria-label="${escapeAttr(scene.title)} 시점" placeholder="시점 미정 / 예: 1달 뒤"></div></article></div></section>`}).join('')}</div>`;
}
function renderAllPlan(){storyAgeCache=null;renderGrid();renderMatrix();renderOutline();renderTimeline();bindSceneOpeners();bindTimelineEditors();bindHierarchyTitleInputs()}
function bindSceneOpeners(){$$('[data-open-scene]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('.year-edit'))return;openScene(el.dataset.openScene)}))}
function setScenePeriod(id,value){state.scenes[id].timelineLabel=value.trim();save();renderAllPlan();}
function bindTimelineEditors(){$$('[data-period-input]').forEach(input=>{input.addEventListener('input',()=>{state.scenes[input.dataset.periodInput].timelineLabel=input.value.trim();scheduleSave();refreshTimelineClock()});input.addEventListener('change',e=>{e.stopPropagation();setScenePeriod(input.dataset.periodInput,input.value)})})}
function refreshTimelineClock(){
 $$('#timelineMode [data-open-scene]').forEach(card=>{const scene=state.scenes[card.dataset.openScene];card.closest('.year-block').querySelector('.year-label h2').textContent=scenePeriodLabel(scene);card.querySelector('.timeline-age').innerHTML=escapeHtml(scene.time)+' · '+escapeHtml(scene.location)+'<br>'+ageText(scene)});
}
function setActiveMode(mode){currentMode=mode;$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));['grid','matrix','outline','timeline'].forEach(m=>$('#'+m+'Mode').classList.toggle('hidden',m!==mode))}
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{renderAllPlan();setActiveMode(b.dataset.mode)}));$('#sceneSearch').addEventListener('input',e=>{searchQuery=e.target.value;renderAllPlan()});

function currentWriteScene(){
  return state.scenes[currentSceneId]||state.scenes[(allCards().find(c=>c.id===currentChapterId)?.scenes||[])[0]]||null
}
function updateWriteNavLabel(){
  const wrap=$('#writeNavWrap'); if(!wrap)return;
  const ch=allCards().find(c=>c.id===currentChapterId);
  const act=ch?episodeForCard(ch.id):null;
  const scene=currentWriteScene();
  $('#writeNavPrimary').textContent=ch?`${ch.title}${scene?.title?' · '+scene.title:''}`:'회차 선택';
  $('#writeNavSecondary').textContent=act?`${act.title}${act.subtitle?' · '+act.subtitle:''}`:'';
}
function renderWriteChapterMenu(){
  const menu=$('#writeChapterMenu'); if(!menu)return;
  let html='';
  for(const act of state.acts){
    html+=`<section class="write-chapter-group"><div class="write-chapter-group-title">${escapeHtml(act.title||'')}${act.subtitle?`<div style="font-size:9px;font-weight:500;color:#999;margin-top:2px">${escapeHtml(act.subtitle)}</div>`:''}</div>`;
    for(const ch of act.chapters){
      const first=state.scenes[ch.scenes[0]];
      html+=`<button type="button" class="write-chapter-item ${ch.id===currentChapterId?'active':''}" data-write-chapter="${ch.id}"><b>${escapeHtml(ch.title)}</b><span>${first?escapeHtml(first.title):'Scene 없음'}</span></button>`;
    }
    html+='</section>';
  }
  menu.innerHTML=html;
  $$('[data-write-chapter]').forEach(btn=>btn.addEventListener('click',()=>{
    const ch=allCards().find(c=>c.id===btn.dataset.writeChapter); if(!ch)return;
    currentChapterId=ch.id; currentSceneId=ch.scenes[0]||currentSceneId;
    renderWriteChapter(currentChapterId,currentSceneId);
    renderWriteChapterMenu(); updateWriteNavLabel(); closeWriteChapterMenu();
    requestAnimationFrame(()=>document.getElementById('write-'+currentSceneId)?.scrollIntoView({behavior:'smooth',block:'start'}));
  }));
}
function openWriteChapterMenu(){
  const wrap=$('#writeNavWrap'),menu=$('#writeChapterMenu'); if(!wrap||!menu)return;
  renderWriteChapterMenu(); wrap.classList.add('open'); menu.classList.remove('hidden'); $('#writeNavTrigger').setAttribute('aria-expanded','true');
}
function closeWriteChapterMenu(){
  const wrap=$('#writeNavWrap'),menu=$('#writeChapterMenu'); if(!wrap||!menu)return;
  wrap.classList.remove('open'); menu.classList.add('hidden'); $('#writeNavTrigger').setAttribute('aria-expanded','false');
}
function toggleWriteChapterMenu(){
  if($('#writeChapterMenu').classList.contains('hidden')) openWriteChapterMenu(); else closeWriteChapterMenu();
}
function switchView(view){
  if(!closeCharacterPopup())return;
  if(!leaveNovelSettings(view)||!flushSave())return;
  novel.classList.toggle('settings-open',view==='settings');
  $('#novelSettingsView').classList.toggle('hidden',view!=='settings');
  $('#novelSettingsBtn').setAttribute('aria-pressed',String(view==='settings'));
  if(view==='settings')renderNovelSettings();
  $$('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  const isEpisodes=view==='episodes',isWrite=view==='write',isGallery=view==='gallery',isPlan=view==='plan';
  $('#episodesView').classList.toggle('hidden',!isEpisodes);
  $('#planView').classList.toggle('hidden',!isPlan);
  $('#writeView').classList.toggle('hidden',!isWrite);
  $('#galleryView').classList.toggle('hidden',!isGallery);
  $('#planToolbar').classList.toggle('hidden',!isPlan);
  $('#writeNavWrap')?.classList.toggle('show',isWrite);
  if(!isWrite){closeWriteChapterMenu();observer?.disconnect()}
  if(isEpisodes)renderEpisodesBrowser();
  else if(isWrite){renderWriteChapter(currentChapterId,currentSceneId);renderWriteChapterMenu();updateWriteNavLabel()}
  else if(isGallery)renderGallery();
  else if(isPlan){renderAllPlan();setActiveMode(currentMode)}
}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('[data-episode-view]').forEach(b=>b.addEventListener('click',()=>setEpisodeBrowserView(b.dataset.episodeView)));
$('#episodeSearch')?.addEventListener('input',e=>{episodeBrowserQuery=e.target.value;renderEpisodesBrowser()});

$('#writeNavTrigger').addEventListener('click',e=>{e.stopPropagation();toggleWriteChapterMenu()});
document.addEventListener('click',e=>{if(!e.target.closest('#writeNavWrap'))closeWriteChapterMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeWriteChapterMenu()});

function openScene(id){currentSceneId=id;currentChapterId=chapterForScene(id)?.id||currentChapterId;switchView('write');requestAnimationFrame(()=>document.getElementById('write-'+id)?.scrollIntoView({behavior:'smooth',block:'start'}))}
function renderBodyHtml(scene){const t=document.createElement('template');t.innerHTML=window.cleanLibraryHTML(scene.bodyHtml||escapeHtml(scene.text).replace(/\n/g,'<br>'));t.content.querySelectorAll('[data-inline-media]').forEach(fig=>{const id=fig.getAttribute('data-inline-media');const media=scene.media.find(m=>m.id===id);const el=fig.querySelector('img,video');if(el&&media){el.removeAttribute('src');el.setAttribute('data-media-id',media.id);if(el.tagName==='IMG')el.setAttribute('alt','')}});return t.innerHTML}
function renderWriteChapter(chapterId,focusId){
  const ch=state.acts.flatMap(a=>a.chapters).find(c=>c.id===chapterId)||state.acts[0].chapters[0];
  currentChapterId=ch.id;const act=actForChapter(ch.id);const ep=writeEpisodeParts(act);
  $('#writeStack').innerHTML=`<div class="chapter-writing-title"><div class="episode-write-head"><input class="write-episode-title" data-write-heading="episode" aria-label="에피소드" value="${escapeAttr(act.title||'')}" placeholder="에피소드"><input class="write-episode-subtitle" data-write-heading="subtitle" aria-label="에피소드 부제" value="${escapeAttr(act.subtitle||'')}" placeholder="에피소드 부제"></div></div><div class="write-chapter-heading"><span>회차</span><input data-write-heading="chapter" aria-label="회차 번호" value="${escapeAttr(ch.title)}"></div>`+ch.scenes.map(id=>{
    const s=normalizeScene(state.scenes[id]);const body=renderBodyHtml(s);
    return `<section class="scene ${id===focusId?'active-scene':''}" id="write-${id}" data-write-scene="${id}"><div class="scene-doc-head"><input class="write-scene-subtitle" data-write-scene-title="${escapeAttr(id)}" aria-label="씬 부제" value="${escapeAttr(/^Scene\s*\d*$/i.test(s.title||'')?'':s.title||'')}" placeholder="씬 부제"></div><h3>${s.title} · ${escapeHtml(scenePeriodLabel(s))} · ${s.time} · ${s.location} · ${ageText(s)}</h3><div class="editor" contenteditable="true" data-editor="${id}">${body}</div></section>`
  }).join('');
  $$('[data-editor]').forEach(ed=>{const id=ed.dataset.editor;ed.addEventListener('click',e=>{if(!e.target.closest('[data-inline-media]'))clearSelectedInlineMedia()});['click','keyup','mouseup','focus'].forEach(ev=>ed.addEventListener(ev,()=>{setActiveScene(id);rememberRange(id)}));ed.addEventListener('input',()=>syncEditor(id));ed.addEventListener('blur',()=>{syncEditor(id);save();renderAllPlan();renderGallery()})});
  bindMediaControls();
  $$('[data-write-heading]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.writeHeading;if(key==='episode')act.title=input.value;else if(key==='subtitle')act.subtitle=input.value;else ch.title=input.value;scheduleSave();renderEpisodesBrowser();renderAllPlan();renderWriteChapterMenu();updateWriteNavLabel()}));
  $$('[data-write-scene-title]').forEach(input=>input.addEventListener('input',()=>{state.scenes[input.dataset.writeSceneTitle].title=input.value;scheduleSave();renderEpisodesBrowser();renderAllPlan();renderGallery();renderWriteChapterMenu();updateWriteNavLabel();alignWriteSceneInfo()}));
  bindHierarchyTitleInputs();
  $$('[data-inline-media]').forEach(fig=>fig.addEventListener('click',e=>{const img=e.target.closest('img,video');if(!img)return;e.preventDefault();e.stopPropagation();selectInlineMedia(fig.dataset.inlineMedia,fig);openPromptEditor(fig.dataset.inlineMedia)}));
  $$('[data-write-scene]').forEach(sec=>sec.addEventListener('click',()=>setActiveScene(sec.dataset.writeScene)));
  $$('[data-editor]').forEach(ed=>ed.addEventListener('keydown',e=>{
    if((e.key==='Backspace'||e.key==='Delete')&&selectedInlineMediaId){
      const fig=document.querySelector(`[data-inline-media="${selectedInlineMediaId}"]`);
      if(fig&&ed.contains(fig)){e.preventDefault();deleteMediaById(selectedInlineMediaId)}
    }
  }));

  $('#infoForm').replaceChildren();setActiveScene(focusId&&ch.scenes.includes(focusId)?focusId:ch.scenes[0]);setupSceneObserver();requestAnimationFrame(alignWriteSceneInfo);hydrateMediaSources($('#writeStack')).catch(console.error);updateWriteNavLabel()
}
function escapeHtml(s){return String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}
function alignWriteSceneInfo(){
 const view=$('#writeView');if(!view||view.classList.contains('hidden'))return;
 const canvas=view.querySelector('.write'),info=view.querySelector('.info');
 for(const section of view.querySelectorAll('[data-write-scene]')){const input=section.querySelector('[data-write-scene-title]');section.classList.toggle('without-subtitle',!input.value.trim())}
 const section=[...view.querySelectorAll('[data-write-scene]')].find(el=>el.dataset.writeScene===currentSceneId);if(!section)return;
 const input=section.querySelector('[data-write-scene-title]'),anchor=input.value.trim()?input:section.querySelector('.editor');
 info.style.marginTop=Math.max(0,anchor.getBoundingClientRect().top-canvas.getBoundingClientRect().top-parseFloat(getComputedStyle(canvas).paddingTop))+'px';
}
window.addEventListener('resize',()=>requestAnimationFrame(alignWriteSceneInfo));
function setActiveScene(id){if(!state.scenes[id])return;const changed=currentSceneId!==id;currentSceneId=id;$$('[data-write-scene]').forEach(sec=>sec.classList.toggle('active-scene',sec.dataset.writeScene===id));if(changed||!$('#infoForm').children.length)renderInfo(id);updateWriteNavLabel();alignWriteSceneInfo()}
function renderInfo(id){storyAgeCache=null;const s=normalizeScene(state.scenes[id]);$('#infoForm').innerHTML=`<div class="field"><label>POV</label><input id="infoPov" value="${escapeAttr(s.pov)}"></div><div class="field"><label for="infoPeriod">시점 (선택)</label><input id="infoPeriod" type="text" value="${escapeAttr(scenePeriod(s))}" placeholder="미정 / 첫 등장 / 1달 뒤 / 1년 뒤"><div class="age-note">연도를 정하지 않아도 됩니다. 어떤 사건 기준인지 함께 적을 수도 있습니다.</div></div><div class="field"><label>시간</label><input id="infoTime" value="${escapeAttr(s.time)}"></div><div class="field"><label>장소</label><input id="infoLocation" value="${escapeAttr(s.location)}"></div><div class="field"><label>등장인물의 나이</label><div class="readonly" id="infoAges">${ageText(s)}</div><div class="age-note">연도 입력 시 첫등장 나이에서 경과 시간을 더합니다(생일 미반영). 연도 없이 입력하면 이야기 시작 기준 +1년 +2달처럼 표시합니다.</div></div><div class="field"><label>등장인물</label><div class="readonly">${characterNames(s)}</div></div><div class="field"><label>장면 목표</label><textarea id="infoGoal">${escapeHtml(s.goal)}</textarea></div><div class="field"><label>메모</label><textarea id="infoNotes">${escapeHtml(s.notes)}</textarea></div>`;
$('#infoPeriod').addEventListener('input',e=>{s.timelineLabel=e.target.value.trim();save();renderAllPlan();$('#infoAges').innerHTML=ageText(s)});
[['#infoPov','pov'],['#infoTime','time'],['#infoLocation','location']].forEach(([sel,key])=>$(sel).addEventListener('input',e=>{s[key]=e.target.value;save();if(key==='location')renderSidebar();const head=document.querySelector(`[data-write-scene="${id}"] h3`);if(head)head.textContent=`${s.title} · ${escapeHtml(scenePeriodLabel(s))} · ${s.time} · ${s.location} · ${ageText(s)}`;renderAllPlan()}));
$('#infoGoal').addEventListener('input',e=>{s.goal=e.target.value;save()});$('#infoNotes').addEventListener('input',e=>{s.notes=e.target.value;save()})
}
function escapeAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}
let writeSizeObserver=null;let observer=null;function setupSceneObserver(){if(!writeSizeObserver&&window.ResizeObserver){writeSizeObserver=new ResizeObserver(()=>requestAnimationFrame(alignWriteSceneInfo));writeSizeObserver.observe($('#writeStack'))}if(observer)observer.disconnect();if(!('IntersectionObserver'in window))return;observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];if(visible&&!$('#infoForm').contains(document.activeElement))setActiveScene(visible.target.dataset.writeScene)},{root:null,threshold:[.25,.5,.75]});$$('[data-write-scene]').forEach(sec=>observer.observe(sec))}

$('#dupModalBackdrop').addEventListener('click',e=>{if(e.target===$('#dupModalBackdrop'))finishDup('cancel')});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#dupModalBackdrop').classList.contains('hidden'))finishDup('cancel')});
$('#promptModalClose').addEventListener('click',closePromptEditor);$('#promptCancel').addEventListener('click',closePromptEditor);$('#promptSave').addEventListener('click',savePromptEditor);$('#promptDelete').addEventListener('click',async()=>{if(promptEditingMediaId){const id=promptEditingMediaId;closePromptEditor();await deleteMediaById(id)}});$('#promptModalBackdrop').addEventListener('click',e=>{if(e.target===$('#promptModalBackdrop'))closePromptEditor()});
$('#galleryPreviewClose').addEventListener('click',closeGalleryPreview);
$('#galleryPreviewDelete').addEventListener('click',async()=>{
  if(!galleryPreviewMediaId)return;
  const id=galleryPreviewMediaId;
  closeGalleryPreview();
  await deleteMediaById(id);
});$('#galleryPreviewBackdrop').addEventListener('click',e=>{if(e.target===$('#galleryPreviewBackdrop'))closeGalleryPreview()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#promptModalBackdrop').classList.contains('hidden'))closePromptEditor();if(!$('#galleryPreviewBackdrop').classList.contains('hidden'))closeGalleryPreview()}});

function renderAll(){renderAllPlan();setActiveMode(currentMode);renderGallery();renderEpisodesBrowser()}
$('#galleryEpisode')?.addEventListener('change',renderGallery);$('#gallerySource')?.addEventListener('change',renderGallery);


/* V49 Create Novel */
const CREATED_NOVELS_KEY='storyloom_created_novels_v1';

function loadCreatedNovels(){
  const items=JSON.parse(localStorage.getItem(CREATED_NOVELS_KEY)||'[]');if(!Array.isArray(items))throw new Error('작품 목록을 읽을 수 없습니다.');return items
}
function saveCreatedNovels(items){
  localStorage.setItem(CREATED_NOVELS_KEY,JSON.stringify(items))
}
function escapeCreateText(s){
  return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
}
const sampleNovels=[];
function allNovels(){return loadCreatedNovels()}
function renderCreatedNovels(){
  const q=($('#librarySearch')?.value||'').trim().toLowerCase();
  const items=allNovels().filter(n=>[n.title,n.author,n.series].join(' ').toLowerCase().includes(q));
  items.sort($('#librarySort')?.value==='title'?(a,b)=>a.title.localeCompare(b.title,'ko'):(a,b)=>b.createdAt-a.createdAt);
  const grouped=$('#libraryGroup')?.value!=='all';const groups=new Map();
  items.forEach(n=>{const name=grouped?(n.series||'시리즈 없음'):'전체 작품';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(n)});
  const entries=[...groups.entries()].sort((a,b)=>(a[0]==='시리즈 없음')-(b[0]==='시리즈 없음'));
  $('#sampleSeriesSection').classList.add('hidden');$('#noSeriesSection').classList.add('hidden');
  $('#dynamicSeriesGroups').innerHTML=entries.map(([name,novels])=>`<section class="series-section"><div class="series-title"><h2>${escapeHtml(name)}</h2><span>${novels.length}권</span></div><div class="book-grid">${novels.map((n,i)=>`<article class="book-card created-book-card" tabindex="0" role="button" data-novel-id="${escapeAttr(n.id)}" aria-label="${escapeAttr(n.title)} 열기"><div class="book-cover alt${i%4}"></div><div class="book-meta"><small>${escapeHtml(n.seriesIndex||'')}</small><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.author||'')}</small></div></article>`).join('')}</div></section>`).join('')||'<p class="empty-message">검색 결과가 없습니다.</p>';
  $$('[data-novel-id]').forEach(card=>{applyCover(card.querySelector('.book-cover'),items.find(n=>n.id===card.dataset.novelId)?.coverKey);});
  $$('[data-novel-id]').forEach(card=>{card.addEventListener('click',()=>openNovel(card.dataset.novelId));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openNovel(card.dataset.novelId)}})});
}
const originalIntro='';
function renderNovelIdentity(){
  const n=allNovels().find(n=>n.id===activeNovelId)||sampleNovels[0];
  $('#novelScreen .title b').textContent=n.title;$('#novelScreen .title span').textContent=[n.series,n.seriesIndex,n.author].filter(Boolean).join(' · ')||'시리즈 없음';
  $('.novel-hero h1').textContent=n.title;$('.novel-kicker').textContent=[n.series,n.seriesIndex,n.author].filter(Boolean).join(' · ')||'새로운 이야기';
  applyCover($('.top-cover'),n.coverKey);applyCover($('.novel-cover-large'),n.coverKey);
  $('.novel-intro').textContent=state.description||'당신의 이야기를 써 내려가세요.';
  $('.novel-tags').classList.toggle('hidden',activeNovelId!=='legacy');document.title=n.title+' · 그을린 흔적의 서재';
}
function renderSidebar(){
  const q=($('#sideSearchInputV45').value||'').trim().toLowerCase();
  const chars=state.characters.map(c=>({id:c.id,name:c.name,detail:c.description||c.detail||'',avatar:c.avatar||c.name.slice(0,1),portraitKey:c.portraitKey,tags:c.tags}));
  const places=[...new Set(Object.values(state.scenes).map(s=>s.location).filter(Boolean))].map(name=>({name,detail:'장면에 사용한 장소',avatar:'⌖'}));
  const other=(state.others||[]).map(x=>({...x,avatar:'▤'}));
  $('.side-scroll-v45').innerHTML=[['인물',chars],['장소',places],['기타',other]].map(([label,items])=>{items=items.filter(x=>(x.name+' '+x.detail).toLowerCase().includes(q));return `<div class="group"><h4><span>${label}</span><small>${items.length}개 ${label==='인물'?'<button type="button" data-add-character aria-label="등장인물 추가">＋</button>':''}</small></h4>${items.map(x=>`<div class="entry" ${x.id&&label==='인물'?`role="button" tabindex="0" data-character-id="${escapeAttr(x.id)}" aria-label="${escapeAttr(x.name)} 인물 정보"`:""}><div class="avatar">${escapeHtml(x.avatar)}</div><div class="codex-entry-content"><div class="codex-entry-heading"><b>${escapeHtml(x.name)}</b>${x.tags?`<span class="codex-entry-tags">${codexTerms(x.tags).map(tag=>`<small>${escapeHtml(tag)}</small>`).join('')}</span>`:''}</div><p>${escapeHtml(x.detail)}</p></div></div>`).join('')||'<p class="empty-message">등록된 항목이 없습니다.</p>'}</div>`}).join('');
  $('.side-counts-v45').innerHTML=`<span>이 작품의 설정 · ${chars.length+places.length+other.length}개</span>`;
  $('#snippetText').value=state.snippets||'';
  $$('[data-character-id]').forEach(el=>{const c=charById(el.dataset.characterId);el.classList.toggle('selected-character',!codexPanel.classList.contains('hidden')&&codexDraft?.id===c?.id);if(c?.portraitKey){applyCover(el.querySelector('.avatar'),c.portraitKey);el.querySelector('.avatar').textContent=''}el.addEventListener('click',()=>openCharacterPopup(el.dataset.characterId,el));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCharacterPopup(el.dataset.characterId,el)}})});
  $('[data-add-character]')?.addEventListener('click',e=>openCharacterPopup(null,e.currentTarget));
}

const createNovelBackdrop=document.getElementById('createNovelBackdrop');
const createNovelOpen=document.getElementById('createNovelOpen');
const createNovelClose=document.getElementById('createNovelClose');
const createNovelCancel=document.getElementById('createNovelCancel');
const createNovelSubmit=document.getElementById('createNovelSubmit');
const createNovelNewSeriesBtn=document.getElementById('createNovelNewSeriesBtn');
const createNovelNewSeries=document.getElementById('createNovelNewSeries');
const createNovelSeries=document.getElementById('createNovelSeries');

const coverUrls=new Map();
async function applyCover(element,key){
  element.dataset.coverKey=key||'';element.style.backgroundImage='';
  if(!key)return;
  try{
    if(!coverUrls.has(key))coverUrls.set(key,window.libraryCloud.getMedia(key).then(blob=>URL.createObjectURL(blob)).catch(error=>{coverUrls.delete(key);throw error}));
    const url=await coverUrls.get(key);
    if(element.dataset.coverKey===key){element.style.backgroundImage=`url("${url}")`;element.style.backgroundSize='cover';element.style.backgroundPosition='center';}
  }catch(error){console.error('표지를 불러오지 못했습니다.',error)}
}
let editingNovelId=null,coverFile=null,coverPreviewUrl=null,uploadedCoverKey=null,creatingNovel=false;
function resetCoverSelection(){
  if(coverPreviewUrl)URL.revokeObjectURL(coverPreviewUrl);
  coverPreviewUrl=null;coverFile=null;uploadedCoverKey=null;
  $('#createNovelCover').value='';$('#createNovelCoverPreview').hidden=true;$('#createNovelCoverPreview').removeAttribute('src');$('#createNovelError').textContent='';
}
$('#createNovelCover').addEventListener('change',async e=>{
  const file=e.target.files[0];resetCoverSelection();if(!file)return;
  if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)||file.size>10*1024*1024){$('#createNovelError').textContent='10MB 이하의 JPG, PNG, WebP, GIF, AVIF 이미지를 선택해 주세요.';return}
  coverFile=file;coverPreviewUrl=URL.createObjectURL(file);$('#createNovelCoverPreview').src=coverPreviewUrl;$('#createNovelCoverPreview').hidden=false;
});
$('#createNovelCoverPreview').addEventListener('error',()=>{resetCoverSelection();$('#createNovelError').textContent='읽을 수 없는 이미지입니다. 다른 파일을 선택해 주세요.'});
$('#createNovelCoverClear').addEventListener('click',resetCoverSelection);
function setCreatingNovel(value){
  creatingNovel=value;
  createNovelBackdrop.querySelectorAll('input,select,button').forEach(el=>el.disabled=value);
  createNovelSubmit.textContent=value?'저장 중…':editingNovelId?'저장':'새 소설 만들기';
}
function openCreateNovelModal(){
  resetCoverSelection();$('#novelCoverFields').hidden=true;editingNovelId=null;$('#createNovelHeading').textContent='새 소설';$('#createNovelSubmit').textContent='새 소설 만들기';
  $('#createNovelTitle').value='새 소설';$('#createNovelAuthor').value='';$('#createNovelSeriesIndex').value='';
  if(typeof refreshSeriesLists==='function')refreshSeriesLists();
  createNovelBackdrop.classList.remove('hidden');
  document.getElementById('createNovelTitle').focus();
  document.getElementById('createNovelTitle').select();
}
function closeCreateNovelModal(){
  if(creatingNovel)return;resetCoverSelection();
  createNovelBackdrop.classList.add('hidden');
}
createNovelOpen?.addEventListener('click',openCreateNovelModal);
createNovelClose?.addEventListener('click',closeCreateNovelModal);
createNovelCancel?.addEventListener('click',closeCreateNovelModal);
createNovelBackdrop?.addEventListener('click',e=>{if(e.target===createNovelBackdrop)closeCreateNovelModal()});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!createNovelBackdrop.classList.contains('hidden'))closeCreateNovelModal();
});
createNovelNewSeriesBtn?.addEventListener('click',()=>{
  createNovelNewSeries.classList.toggle('hidden');
  if(!createNovelNewSeries.classList.contains('hidden'))createNovelNewSeries.focus();
});
createNovelSubmit?.addEventListener('click',async()=>{
  if(creatingNovel)return;
  try{
  const title=document.getElementById('createNovelTitle').value.trim();
  const author=document.getElementById('createNovelAuthor').value.trim();
  const seriesTyped=createNovelNewSeries.classList.contains('hidden')?'':createNovelNewSeries.value.trim();
  const series=seriesTyped||createNovelSeries.value;
  const seriesIndex=document.getElementById('createNovelSeriesIndex').value.trim();
  if(!title){
    document.getElementById('createNovelTitle').focus();
    return;
  }
  setCreatingNovel(true);$('#createNovelError').textContent='';
  if(coverFile&&!uploadedCoverKey){const key='cover_'+crypto.randomUUID();await window.libraryCloud.putMedia(key,coverFile);uploadedCoverKey=key;}
  const items=loadCreatedNovels();
  const newNovel={id:'novel_'+crypto.randomUUID(),title,author,series,seriesIndex,createdAt:Date.now(),...(uploadedCoverKey?{coverKey:uploadedCoverKey}:{})};
  if(editingNovelId){
    if(sampleNovels.some(n=>n.id===editingNovelId)){const overrides=JSON.parse(localStorage.getItem('storyloom_sample_metadata_v2')||'{}');overrides[editingNovelId]={title,author,series,seriesIndex};localStorage.setItem('storyloom_sample_metadata_v2',JSON.stringify(overrides))}
    else{const item=items.find(n=>n.id===editingNovelId);Object.assign(item,{title,author,series,seriesIndex,...(uploadedCoverKey?{coverKey:uploadedCoverKey}:{})})}
  }else items.push(newNovel);
  saveCreatedNovels(items);
  if(!editingNovelId)editingNovelId=newNovel.id;
  await window.libraryCloud.flush();
  renderCreatedNovels();
  if(editingNovelId===activeNovelId)renderNovelIdentity();
  setCreatingNovel(false);closeCreateNovelModal();

  document.getElementById('createNovelTitle').value='새 소설';
  document.getElementById('createNovelAuthor').value='';
  document.getElementById('createNovelSeriesIndex').value='';
  document.getElementById('createNovelNewSeries').value='';
  document.getElementById('createNovelNewSeries').classList.add('hidden');
  document.getElementById('createNovelSeries').value='';
  }catch(e){$('#createNovelError').textContent='저장하지 못했습니다. '+(e.message||'다시 시도해 주세요.');}
  finally{setCreatingNovel(false)}
});
renderCreatedNovels();


/* V50 Series Manager */
const CREATED_SERIES_KEY='storyloom_created_series_v1';

function loadCreatedSeries(){
  try{return JSON.parse(localStorage.getItem(CREATED_SERIES_KEY)||'[]')}catch(e){return []}
}
function saveCreatedSeries(items){
  localStorage.setItem(CREATED_SERIES_KEY,JSON.stringify(items))
}
function refreshSeriesLists(){
  const names=[...new Set([...loadCreatedSeries().map(x=>x.name),...allNovels().map(x=>x.series).filter(Boolean)])];
  const items=names.map(name=>({name}));
  const manager=document.getElementById('seriesManagerSelect');
  const createSelect=document.getElementById('createNovelSeries');
  const info=document.getElementById('seriesManagerInfo');

  if(manager){
    if(items.length){
      manager.innerHTML=items.map(x=>`<option value="${escapeCreateText(x.name)}">${escapeCreateText(x.name)}</option>`).join('');
      if(info)info.textContent=`${items.length}개의 시리즈가 있습니다.`;
    }else{
      manager.innerHTML='<option value="">만들어진 시리즈 없음</option>';
      if(info)info.textContent='아직 만든 시리즈가 없습니다.';
    }
  }

  if(createSelect){
    if(items.length){
      createSelect.innerHTML='<option value="">시리즈 없음</option>'+items.map(x=>`<option value="${escapeCreateText(x.name)}">${escapeCreateText(x.name)}</option>`).join('');
    }else{
      createSelect.innerHTML='<option value="">만들어진 시리즈 없음</option>';
    }
  }
}

const homeNovelsTabV50=document.getElementById('homeNovelsTab');
const homeSeriesTabV50=document.getElementById('homeSeriesTab');
const novelsHomePanelV50=document.getElementById('novelsHomePanel');
const seriesHomePanelV50=document.getElementById('seriesHomePanel');

function showNovelLibraryV50(){
  novelsHomePanelV50?.classList.remove('hidden');
  seriesHomePanelV50?.classList.add('hidden');
  homeNovelsTabV50?.classList.add('active');
  homeSeriesTabV50?.classList.remove('active');
}
function showSeriesLibraryV50(){
  novelsHomePanelV50?.classList.add('hidden');
  seriesHomePanelV50?.classList.remove('hidden');
  homeSeriesTabV50?.classList.add('active');
  homeNovelsTabV50?.classList.remove('active');
  refreshSeriesLists();
}
homeNovelsTabV50?.addEventListener('click',showNovelLibraryV50);
homeSeriesTabV50?.addEventListener('click',showSeriesLibraryV50);

const newSeriesBackdropV50=document.getElementById('newSeriesBackdrop');
const newSeriesOpenV50=document.getElementById('newSeriesOpen');
const newSeriesCancelV50=document.getElementById('newSeriesCancel');
const newSeriesSubmitV50=document.getElementById('newSeriesSubmit');
const newSeriesNameInputV50=document.getElementById('newSeriesNameInput');

function openNewSeriesV50(){
  newSeriesBackdropV50?.classList.remove('hidden');
  if(newSeriesNameInputV50){
    newSeriesNameInputV50.value='';
    setTimeout(()=>newSeriesNameInputV50.focus(),0);
  }
}
function closeNewSeriesV50(){newSeriesBackdropV50?.classList.add('hidden')}

newSeriesOpenV50?.addEventListener('click',openNewSeriesV50);
newSeriesCancelV50?.addEventListener('click',closeNewSeriesV50);
newSeriesBackdropV50?.addEventListener('click',e=>{if(e.target===newSeriesBackdropV50)closeNewSeriesV50()});
newSeriesNameInputV50?.addEventListener('keydown',e=>{if(e.key==='Enter')newSeriesSubmitV50?.click()});
newSeriesSubmitV50?.addEventListener('click',()=>{
  try{
  const name=(newSeriesNameInputV50?.value||'').trim();
  if(!name){newSeriesNameInputV50?.focus();return}
  const items=loadCreatedSeries();
  if(!items.some(x=>x.name.toLowerCase()===name.toLowerCase())){
    items.push({id:'series_'+Date.now(),name,createdAt:Date.now()});
    saveCreatedSeries(items);
  }
  refreshSeriesLists();
  const manager=document.getElementById('seriesManagerSelect');
  if(manager)manager.value=name;
  closeNewSeriesV50();
  }catch(e){alert('시리즈를 저장하지 못했습니다. 저장 공간을 확인해 주세요.')}
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && !newSeriesBackdropV50?.classList.contains('hidden'))closeNewSeriesV50();
});

refreshSeriesLists();

$('#librarySearch').addEventListener('input',renderCreatedNovels);
$('#librarySort').addEventListener('change',renderCreatedNovels);
$('#libraryGroup').addEventListener('change',renderCreatedNovels);
let settingsDirty=false,settingsSaving=false,settingsFile=null,settingsObjectUrl=null,settingsCoverKey=null,settingsUploadedKey=null;
function leaveNovelSettings(next){
  if(!novel.classList.contains('settings-open')||next==='settings')return true;
  if(settingsSaving)return false;
  if(settingsDirty&&!confirm('저장하지 않은 소설 설정을 버리고 이동할까요?'))return false;
  settingsDirty=false;return true;
}
function renderNovelSettings(){
  const n=allNovels().find(n=>n.id===activeNovelId);if(!n)return;
  if(settingsObjectUrl)URL.revokeObjectURL(settingsObjectUrl);
  settingsFile=null;settingsObjectUrl=null;settingsUploadedKey=null;settingsCoverKey=n.coverKey||null;settingsDirty=false;
  $('#settingsTitle').value=n.title;$('#settingsAuthor').value=n.author||'';$('#settingsSeries').value=n.series||'';$('#settingsSeriesIndex').value=n.seriesIndex||'';
  $('#settingsSeriesList').innerHTML=[...new Set([...loadCreatedSeries().map(x=>x.name),...allNovels().map(x=>x.series).filter(Boolean)])].map(x=>`<option value="${escapeCreateText(x)}"></option>`).join('');
  $('#settingsCoverFile').value='';$('#settingsStatus').textContent='';
  refreshSettingsCover();
}
function refreshSettingsCover(){
  const preview=$('#settingsCoverPreview');
  preview.classList.toggle('has-cover',!!(settingsFile||settingsCoverKey));
  if(settingsObjectUrl){preview.dataset.coverKey='';preview.style.backgroundImage=`url("${settingsObjectUrl}")`;}
  else applyCover(preview,settingsCoverKey);
  $('#settingsCoverRemove').disabled=settingsSaving||!(settingsFile||settingsCoverKey);
}
async function selectSettingsCover(file){
  if(!file||settingsSaving)return;
  if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)||file.size>10*1024*1024){$('#settingsStatus').textContent='10MB 이하의 JPG, PNG, WebP, GIF, AVIF 이미지를 선택해 주세요.';return;}
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;await img.decode();}catch{URL.revokeObjectURL(url);$('#settingsStatus').textContent='읽을 수 없는 이미지입니다.';return;}
  if(settingsObjectUrl)URL.revokeObjectURL(settingsObjectUrl);
  settingsObjectUrl=url;settingsFile=file;settingsUploadedKey=null;settingsDirty=true;$('#settingsStatus').textContent='변경 사항을 저장해 주세요.';refreshSettingsCover();
}
$('#novelSettingsBtn').addEventListener('click',()=>{if(!novel.classList.contains('settings-open'))switchView('settings')});
$('#novelSettingsForm').addEventListener('input',()=>{settingsDirty=true;$('#settingsStatus').textContent='변경 사항을 저장해 주세요.'});
$('#settingsReset').addEventListener('click',renderNovelSettings);
$('#settingsCoverUpload').addEventListener('click',()=>$('#settingsCoverFile').click());
$('#settingsCoverFile').addEventListener('change',e=>selectSettingsCover(e.target.files[0]));
$('#settingsCoverRemove').addEventListener('click',()=>{
  if(settingsObjectUrl)URL.revokeObjectURL(settingsObjectUrl);
  settingsObjectUrl=null;settingsFile=null;settingsCoverKey=null;settingsUploadedKey=null;settingsDirty=true;$('#settingsCoverFile').value='';refreshSettingsCover();$('#settingsStatus').textContent='저장하면 표지가 삭제됩니다.';
});
const settingsDrop=$('#settingsCoverPreview');
['dragenter','dragover'].forEach(type=>settingsDrop.addEventListener(type,e=>{e.preventDefault();settingsDrop.classList.add('drag-over')}));
['dragleave','drop'].forEach(type=>settingsDrop.addEventListener(type,e=>{e.preventDefault();settingsDrop.classList.remove('drag-over');if(type==='drop')selectSettingsCover(e.dataTransfer.files[0])}));
$('#novelSettingsForm').addEventListener('submit',async e=>{
 e.preventDefault();if(settingsSaving)return;
 const title=$('#settingsTitle').value.trim();if(!title){$('#settingsTitle').focus();return;}
 const novelId=activeNovelId;settingsSaving=true;
 $('#novelSettingsForm').querySelectorAll('input,button').forEach(el=>el.disabled=true);$('#settingsStatus').textContent='저장 중…';
 try{
  if(settingsFile&&!settingsUploadedKey){settingsUploadedKey='cover_'+crypto.randomUUID();try{await window.libraryCloud.putMedia(settingsUploadedKey,settingsFile)}catch(error){settingsUploadedKey=null;throw error}}
  const items=loadCreatedNovels(),item=items.find(n=>n.id===novelId);if(!item)throw new Error('소설을 찾을 수 없습니다.');
  Object.assign(item,{title,author:$('#settingsAuthor').value.trim(),series:$('#settingsSeries').value.trim(),seriesIndex:$('#settingsSeriesIndex').value.trim()});
  const key=settingsUploadedKey||settingsCoverKey;if(key)item.coverKey=key;else delete item.coverKey;
  saveCreatedNovels(items);await window.libraryCloud.flush();settingsDirty=false;
  renderNovelIdentity();renderCreatedNovels();renderNovelSettings();$('#settingsStatus').textContent='클라우드에 저장했습니다.';
 }catch(error){$('#settingsStatus').textContent='저장하지 못했습니다. '+(error.message||'다시 시도해 주세요.');}
 finally{settingsSaving=false;$('#novelSettingsForm').querySelectorAll('input,button').forEach(el=>el.disabled=false);refreshSettingsCover();}
});
window.addEventListener('beforeunload',e=>{if(settingsDirty||settingsSaving){e.preventDefault();e.returnValue=''}});
$('#sideSearchInputV45').addEventListener('input',renderSidebar);
$$('.side-tabs-v45 button').forEach((button,index)=>button.addEventListener('click',()=>{
  $$('.side-tabs-v45 button').forEach(b=>b.classList.toggle('active',b===button));
  $('.side-scroll-v45').classList.toggle('hidden',index===1);$('.side-search-v45').classList.toggle('hidden',index===1);$('.side-counts-v45').classList.toggle('hidden',index===1);$('#snippetPanel').classList.toggle('hidden',index===0);
}));
$('#snippetText').addEventListener('input',e=>{state.snippets=e.target.value;scheduleSave()});
$('.top-ghost-btn').addEventListener('click',()=>{$('#novelScreen').classList.toggle('sidebar-collapsed')});
$('.top-ghost-btn.compact').addEventListener('click',()=>{$('#novelScreen').classList.toggle('focus-writing')});
/* Character mention matching: pure helpers, also exercised by tests. */
function codexTerms(value){return (Array.isArray(value)?value:String(value||'').split(/[,\n]/)).map(x=>String(x).trim()).filter(Boolean)}
function codexMatches(text,character){
 text=String(text||'');if(character.tracking===false)return [];
 const fold=s=>character.caseSensitive?s:s.toLocaleLowerCase();
 const hay=fold(text),terms=[...new Set([character.name,...codexTerms(character.aliases)].filter(Boolean).map(fold))].sort((a,b)=>b.length-a.length);
 const excluded=[];for(const phrase of codexTerms(character.exclusions)){const needle=fold(phrase);let pos=0;while((pos=hay.indexOf(needle,pos))!==-1){excluded.push([pos,pos+needle.length]);pos+=needle.length}}
 const matches=[];for(let pos=0;pos<hay.length;){const term=terms.find(t=>hay.startsWith(t,pos)&&!excluded.some(([a,b])=>pos<b&&pos+t.length>a));if(term){matches.push([pos,pos+term.length]);pos+=term.length}else pos++}return matches;
}
function codexMentionExcerpts(text,matches,context=80){
 text=String(text||'');const windows=[];
 for(const [a,b] of matches){
  let start=Math.max(0,a-context),end=Math.min(text.length,b+context);
  const before=text.slice(start,a),after=text.slice(b,end);
  const leftBreaks=[...before.matchAll(/\n/g)].map(m=>start+m.index);
  const rightBreaks=[...after.matchAll(/\n/g)].map(m=>b+m.index);
  if(leftBreaks.length>2)start=leftBreaks[leftBreaks.length-3]+1;
  if(rightBreaks.length>2)end=rightBreaks[2];
  if(start>0&&/[\uDC00-\uDFFF]/.test(text[start]))start--;
  if(end<text.length&&/[\uDC00-\uDFFF]/.test(text[end]))end++;
  const previous=windows.at(-1);if(previous&&start<=previous[1])previous[1]=Math.max(previous[1],end);else windows.push([start,end]);
 }
 return windows.map(([start,end])=>({text:text.slice(start,end),leading:start>0,trailing:end<text.length,matches:matches.filter(([a,b])=>a>=start&&b<=end).map(([a,b])=>[a-start,b-start])}));
}
/* End character mention helpers. */
let codexDraft=null,codexDirty=false,codexBusy=false,codexTab='details',codexSub='notes',codexPinned=false,codexOpener=null,codexPortraitFile=null,codexPortraitURL=null,codexLoadToken=0;
const codexPanel=document.createElement('section');
codexPanel.id='characterPopup';codexPanel.className='character-popup hidden';codexPanel.setAttribute('role','dialog');codexPanel.setAttribute('aria-label','등장인물 정보');
codexPanel.innerHTML=`<div class="character-popup-tools"><button type="button" id="characterPin" aria-pressed="false">⌖ 고정</button><button type="button" id="characterClose" aria-label="인물 창 닫기">×</button></div><div class="character-popup-card"><div id="characterScope" class="character-scope"></div><div class="character-heading"><div><span class="character-type">◎ 등장인물</span><h2 id="characterHeading"></h2><div id="characterTags" class="character-tags"></div></div><button type="button" id="characterPortrait" aria-label="인물 사진 변경"><span>◎</span></button><input id="characterPortraitFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden></div><div class="character-summary"><span id="characterMentionCount"></span><button type="button" id="characterPortraitRemove">사진 지우기</button></div><div class="character-tabs" role="tablist" aria-label="인물 정보 탭">${[['details','상세 정보'],['research','자료'],['relations','관계'],['mentions','언급'],['tracking','추적 설정']].map(([id,label])=>`<button type="button" role="tab" id="characterTab-${id}" data-character-tab="${id}" aria-controls="characterBody">${label}</button>`).join('')}</div><div id="characterBody" role="tabpanel" tabindex="0"></div><div class="character-footer"><span id="characterStatus" role="status" aria-live="polite"></span><button type="button" id="characterSave">저장</button></div></div>`;
novel.append(codexPanel);
function characterDirty(){codexDirty=true;$('#characterStatus').textContent='저장하지 않은 변경 사항'}
function positionCharacterPopup(){
 if(codexPanel.classList.contains('hidden'))return;
 const side=$('.side.side-v45').getBoundingClientRect(),top=$('.top').getBoundingClientRect();
 const left=innerWidth>900&&side.width?side.right+12:12;
 codexPanel.style.left=left+'px';codexPanel.style.top=Math.max(12,top.bottom+12)+'px';codexPanel.style.width=Math.max(260,Math.min(650,innerWidth-left-16))+'px';codexPanel.style.maxHeight=Math.max(200,innerHeight-Math.max(12,top.bottom+12)-16)+'px';
}
window.addEventListener('resize',positionCharacterPopup);window.addEventListener('scroll',positionCharacterPopup,{passive:true});
function closeCharacterPopup(force=false){
 if(codexPanel.classList.contains('hidden'))return true;
 if(codexBusy)return false;
 if(codexDirty&&!force&&!confirm('저장하지 않은 인물 정보를 버리고 닫을까요?'))return false;
 codexLoadToken++;codexPanel.classList.add('hidden');codexDraft=null;codexDirty=false;
 if(codexPortraitURL)URL.revokeObjectURL(codexPortraitURL);codexPortraitURL=null;codexPortraitFile=null;
 $$('[data-character-id]').forEach(el=>el.classList.remove('selected-character'));
 if(codexOpener?.isConnected)codexOpener.focus();return true;
}
function openCharacterPopup(id,opener){
 if(!closeCharacterPopup())return;
 codexDraft=structuredClone(charById(id)||{id:'character_'+crypto.randomUUID(),name:'새 등장인물',avatar:'◎',description:'',aliases:[],tags:[],relations:[],details:[],researchNotes:'',researchLinks:[],tracking:true});
 codexTab='details';codexSub='notes';codexOpener=opener;codexPortraitFile=null;codexDirty=!id;
 codexPanel.classList.remove('hidden');renderCharacterHeader();renderCharacterBody();positionCharacterPopup();
 $('#characterStatus').textContent=id?'':'이름과 정보를 입력한 뒤 저장해 주세요.';
 $$('[data-character-id]').forEach(el=>el.classList.toggle('selected-character',el.dataset.characterId===id));
 $('#characterTab-details').focus();
}
function characterSources(kind){
 if(kind==='codex')return state.characters.filter(c=>c.id!==codexDraft.id).map(c=>({label:c.name,text:c.description||c.detail||''}));
 if(kind==='snippets')return [{label:'작품 메모',text:state.snippets||''}];
 return orderedSceneIds().map(id=>{const scene=state.scenes[id];return {id,label:`${chapterForScene(id)?.title||''} · ${scene.title}`,text:kind==='summaries'?[scene.goal,scene.notes].filter(Boolean).join('\n'):scene.text||''}});
}
function characterMentions(kind='manuscript'){return characterSources(kind).map(source=>({...source,matches:codexMatches(source.text,codexDraft)})).filter(source=>source.matches.length)}
function renderCharacterHeader(){
 const n=allNovels().find(n=>n.id===activeNovelId);
 $('#characterScope').textContent=`${n?.title||'이 소설'}의 등장인물`;
 $('#characterHeading').textContent=codexDraft.name||'이름 없는 인물';
 $('#characterTags').innerHTML=codexTerms(codexDraft.tags).map(tag=>`<span>${escapeHtml(tag)}</span>`).join('');
 $('#characterMentionCount').textContent=`원고에서 ${characterMentions().reduce((sum,s)=>sum+s.matches.length,0).toLocaleString()}회 언급`;
 const portrait=$('#characterPortrait');portrait.classList.toggle('has-portrait',!!(codexPortraitURL||codexDraft.portraitKey));
 if(codexPortraitURL){portrait.dataset.coverKey='';portrait.style.backgroundImage=`url("${codexPortraitURL}")`}else applyCover(portrait,codexDraft.portraitKey);
 $('#characterPortraitRemove').hidden=!(codexPortraitURL||codexDraft.portraitKey);
}
function characterField(label,key,value,type='input',hint=''){
 return `<label class="character-field">${label}${hint?`<small>${hint}</small>`:''}${type==='textarea'?`<textarea data-character-field="${key}">${escapeHtml(value||'')}</textarea>`:`<input data-character-field="${key}" value="${escapeAttr(value??'')}" ${type==='number'?'type="number" min="0" max="10000"':''}>`}</label>`;
}
function renderCharacterBody(){
 if(!codexDraft)return;
 const c=codexDraft,body=$('#characterBody');
 $$('[data-character-tab]').forEach(button=>{const active=button.dataset.characterTab===codexTab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});body.setAttribute('aria-labelledby','characterTab-'+codexTab);
 if(codexTab==='details'){
 body.innerHTML=`<div class="character-section">${characterField('이름','name',c.name)}<div class="character-field-pair">${characterField('태그','tags',codexTerms(c.tags).join(', '),'input','쉼표로 구분하세요.')}${characterField('첫등장 나이','baseAge',c.baseAge,'number')}</div>${characterField('첫등장 연도 (선택)','firstYear',c.firstYear,'number','연도를 모르면 비워 두세요. 첫 등장 장면의 연도가 있으면 자동으로 사용합니다.')}${characterField('별칭 / 애칭','aliases',codexTerms(c.aliases).join(', '),'input','원고에서 함께 찾을 이름을 쉼표로 구분하세요.')}${characterField('설명','description',c.description||c.detail,'textarea','외모, 성격, 배경 등 인물의 특징을 적어 주세요.')}<div class="character-text-meta"><span id="characterDescriptionCount">${(c.description||c.detail||'').length}자</span></div><div id="characterCustomDetails">${(c.details||[]).map((d,i)=>`<div class="character-custom-row"><input aria-label="추가 정보 이름" data-detail-name="${i}" value="${escapeAttr(d.label||'')}" placeholder="예: 직업"><textarea aria-label="추가 정보 내용" data-detail-value="${i}">${escapeHtml(d.value||'')}</textarea><button type="button" data-detail-remove="${i}" aria-label="추가 정보 삭제">×</button></div>`).join('')}</div><button type="button" id="characterAddDetail">＋ 세부 정보 추가</button></div>`;
 }else if(codexTab==='research'){
 body.innerHTML=`<div class="character-subtabs"><button type="button" data-character-sub="notes" class="${codexSub==='notes'?'active':''}">메모</button><button type="button" data-character-sub="external" class="${codexSub==='external'?'active':''}">외부 자료</button></div><div class="character-section">${codexSub==='notes'?characterField('자료 메모','researchNotes',c.researchNotes,'textarea','인물 설정에 참고할 자료와 아이디어를 기록하세요.'): `<h3>외부 자료</h3><p>참고 링크를 저장합니다. 링크의 내용은 자동으로 수집하지 않습니다.</p>${(c.researchLinks||[]).map((link,i)=>`<div class="character-link-row"><input aria-label="자료 제목" data-link-title="${i}" value="${escapeAttr(link.title||'')}" placeholder="자료 제목"><input aria-label="자료 주소" data-link-url="${i}" value="${escapeAttr(link.url||'')}" placeholder="https://">${safeCharacterURL(link.url)?`<a href="${escapeAttr(safeCharacterURL(link.url))}" target="_blank" rel="noopener noreferrer">열기 ↗</a>`:''}<button type="button" data-link-remove="${i}" aria-label="자료 삭제">×</button></div>`).join('')}<button type="button" id="characterAddLink">＋ 자료 추가</button>`}</div>`;
 }else if(codexTab==='relations'){
 const others=state.characters.filter(x=>x.id!==c.id&&!((c.relations||[]).some(r=>r.id===x.id)));
 body.innerHTML=`<div class="character-section"><h3>인물 관계</h3><p>다른 등장인물과 연결하고 관계를 기록하세요.</p><div class="character-relation-add"><select id="characterRelationTarget" aria-label="연결할 인물"><option value="">인물 선택</option>${others.map(x=>`<option value="${escapeAttr(x.id)}">${escapeHtml(x.name)}</option>`).join('')}</select><button type="button" id="characterAddRelation">＋ 관계 추가</button></div>${(c.relations||[]).map((r,i)=>`<div class="character-relation-row"><strong>${escapeHtml(charById(r.id)?.name||'삭제된 인물')}</strong><input aria-label="관계 설명" data-relation-label="${i}" value="${escapeAttr(r.label||'')}" placeholder="예: 친구, 연인, 라이벌"><button type="button" data-relation-remove="${i}" aria-label="관계 삭제">−</button></div>`).join('')||'<p class="character-empty">아직 연결된 인물이 없습니다.</p>'}</div>`;
 }else if(codexTab==='mentions'){
 const source=['manuscript','summaries','codex','snippets'].includes(codexSub)?codexSub:'manuscript';codexSub=source;
 const items=characterMentions(source);
 body.innerHTML=`<div class="character-subtabs">${[['manuscript','원고'],['summaries','장면 메모'],['codex','설정집'],['snippets','작품 메모']].map(([id,label])=>`<button type="button" data-character-sub="${id}" class="${id===source?'active':''}">${label} <small>${characterMentions(id).reduce((n,s)=>n+s.matches.length,0)}</small></button>`).join('')}</div>${items.map(item=>`<article class="character-mention"><header><strong>${escapeHtml(item.label)}</strong><span>${item.matches.length}회</span>${item.id?`<button type="button" data-character-scene="${escapeAttr(item.id)}">장면 열기 ↗</button>`:''}</header>${codexMentionExcerpts(item.text,item.matches).map(excerpt=>`<p>${highlightCharacterMentions(excerpt.text,excerpt.matches)}</p>`).join('')}</article>`).join('')||`<p class="character-empty">${c.tracking===false?'이름 추적이 꺼져 있습니다. 추적 설정에서 켜 주세요.':'이름이나 별칭이 언급된 내용이 없습니다.'}</p>`}`;
 }else{
 body.innerHTML=`<div class="character-section"><h3>이름 추적 / 일치 설정</h3><label class="character-check"><input type="checkbox" data-character-check="tracking" ${c.tracking!==false?'checked':''}> 이름과 별칭으로 언급을 찾습니다.</label><label class="character-check"><input type="checkbox" data-character-check="caseSensitive" ${c.caseSensitive?'checked':''}> 영문 이름과 별칭의 대소문자를 구분합니다.</label>${characterField('제외할 문구','exclusions',codexTerms(c.exclusions).join(', '),'input','이 문구 안에 포함된 이름은 언급으로 세지 않습니다. 쉼표로 구분하세요.')}</div><div class="character-section"><h3>AI 참고 정보</h3><p class="character-notice">현재 AI 연동은 없습니다. 아래 선택은 인물의 참고 정보 사용 설정으로만 저장됩니다.</p>${[['always','항상 포함','AI가 참고할 정보에 항상 포함합니다.'],['detected','이름이 감지되면 포함 (기본)','본문에서 이름이나 별칭을 찾았을 때 포함합니다.'],['manual','직접 선택할 때만 포함','자동으로 포함하지 않고 직접 선택할 때만 사용합니다.'],['never','포함하지 않음','AI가 참고하는 정보에서 제외합니다.']].map(([id,label,hint])=>`<label class="character-radio"><input type="radio" name="characterAIContext" value="${id}" ${(c.aiContext||'detected')===id?'checked':''}><span>${label}<small>${hint}</small></span></label>`).join('')}</div>`;
 }
 body.scrollTop=0;
}
function safeCharacterURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}}
function highlightCharacterMentions(text,matches){
 // Keep large manuscripts responsive while still reporting the complete count.
 const start=Math.max(0,(matches[0]?.[0]||0)-100),end=Math.min(text.length,start+2500);let pos=start,html=start?'…':'';
 for(const [a,b] of matches){if(a<start||a>=end)continue;html+=escapeHtml(text.slice(pos,a))+'<mark>'+escapeHtml(text.slice(a,Math.min(b,end)))+'</mark>';pos=Math.min(b,end)}
 return html+escapeHtml(text.slice(pos,end))+(end<text.length?'…':'');
}
codexPanel.addEventListener('input',e=>{
 if(!codexDraft||codexBusy)return;const el=e.target,d=el.dataset,c=codexDraft;
 if(d.characterField){const key=d.characterField;c[key]=['aliases','tags','exclusions'].includes(key)?codexTerms(el.value):['baseAge','firstYear'].includes(key)?(el.value===''?null:Number(el.value)):el.value;}
 else if(d.characterCheck)c[d.characterCheck]=el.checked;
 else if(el.name==='characterAIContext')c.aiContext=el.value;
 else if(d.detailName!==undefined)c.details[+d.detailName].label=el.value;
 else if(d.detailValue!==undefined)c.details[+d.detailValue].value=el.value;
 else if(d.linkTitle!==undefined)c.researchLinks[+d.linkTitle].title=el.value;
 else if(d.linkUrl!==undefined)c.researchLinks[+d.linkUrl].url=el.value;
 else if(d.relationLabel!==undefined)c.relations[+d.relationLabel].label=el.value;
 else return;
 characterDirty();renderCharacterHeader();if($('#characterDescriptionCount'))$('#characterDescriptionCount').textContent=(c.description||'').length+'자';
});
codexPanel.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button||codexBusy)return;const d=button.dataset,c=codexDraft;
 if(d.characterTab){codexTab=d.characterTab;codexSub=codexTab==='mentions'?'manuscript':'notes';renderCharacterBody()}
 if(d.characterSub){codexSub=d.characterSub;renderCharacterBody()}
 if(button.id==='characterAddDetail'){(c.details??=[]).push({label:'',value:''});characterDirty();renderCharacterBody()}
 if(button.id==='characterAddLink'){(c.researchLinks??=[]).push({title:'',url:''});characterDirty();renderCharacterBody()}
 if(button.id==='characterAddRelation'){const id=$('#characterRelationTarget').value;if(id){(c.relations??=[]).push({id,label:''});characterDirty();renderCharacterBody()}}
 for(const [attr,key] of [['detailRemove','details'],['linkRemove','researchLinks'],['relationRemove','relations']])if(d[attr]!==undefined){c[key].splice(+d[attr],1);characterDirty();renderCharacterBody()}
 if(d.characterScene){const id=d.characterScene;if(closeCharacterPopup())openScene(id)}
});
$('.character-tabs').addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=$$('[data-character-tab]');let index=tabs.indexOf(document.activeElement);index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[index].click();tabs[index].focus();
});
$('#characterClose').addEventListener('click',()=>closeCharacterPopup());
$('#characterPin').addEventListener('click',()=>{codexPinned=!codexPinned;$('#characterPin').setAttribute('aria-pressed',String(codexPinned));$('#characterPin').textContent=codexPinned?'⌖ 고정됨':'⌖ 고정'});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!codexPanel.classList.contains('hidden')){e.preventDefault();closeCharacterPopup()}});
document.addEventListener('click',e=>{if(!codexPinned&&!codexPanel.classList.contains('hidden')&&!e.composedPath().includes(codexPanel)&&!e.target.closest('[data-character-id],[data-add-character]')&&!codexDirty&&!codexBusy)closeCharacterPopup()});
$('#characterPortrait').addEventListener('click',()=>$('#characterPortraitFile').click());
$('#characterPortraitFile').addEventListener('change',async e=>{
 const file=e.target.files[0];e.target.value='';if(!file||codexBusy)return;const token=++codexLoadToken;
 if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)||file.size>10*1024*1024){$('#characterStatus').textContent='10MB 이하의 이미지 파일을 선택해 주세요.';return}
 const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode()}catch{URL.revokeObjectURL(url);if(token===codexLoadToken)$('#characterStatus').textContent='읽을 수 없는 이미지입니다.';return}
 if(token!==codexLoadToken||!codexDraft){URL.revokeObjectURL(url);return}
 if(codexPortraitURL)URL.revokeObjectURL(codexPortraitURL);codexPortraitURL=url;codexPortraitFile=file;characterDirty();renderCharacterHeader();
});
$('#characterPortraitRemove').addEventListener('click',()=>{codexLoadToken++;if(codexPortraitURL)URL.revokeObjectURL(codexPortraitURL);codexPortraitURL=null;codexPortraitFile=null;delete codexDraft.portraitKey;characterDirty();renderCharacterHeader()});
$('#characterSave').addEventListener('click',async()=>{
 if(codexBusy||!codexDraft)return;
 if(!codexDraft.name.trim()){codexTab='details';renderCharacterBody();$('#characterStatus').textContent='인물 이름을 입력해 주세요.';return}
 if((codexDraft.researchLinks||[]).some(x=>x.url&&!safeCharacterURL(x.url))){$('#characterStatus').textContent='자료 주소는 http:// 또는 https://로 입력해 주세요.';return}
 codexBusy=true;codexLoadToken++;codexPanel.querySelectorAll('input,textarea,button,select').forEach(el=>el.disabled=true);$('#characterStatus').textContent='클라우드에 저장 중…';
 try{
 if(codexPortraitFile){const key='character_'+crypto.randomUUID();await window.libraryCloud.putMedia(key,codexPortraitFile);codexDraft.portraitKey=key;codexPortraitFile=null;}
 codexDraft.name=codexDraft.name.trim();const existing=charById(codexDraft.id);if(existing)Object.assign(existing,structuredClone(codexDraft));else state.characters.push(structuredClone(codexDraft));
 if(!codexDraft.portraitKey&&existing)delete existing.portraitKey;
 if(!save())throw new Error('소설 데이터를 저장할 수 없습니다.');await window.libraryCloud.flush();codexDirty=false;renderSidebar();renderAllPlan();$('#characterStatus').textContent='클라우드에 저장했습니다.';
 }catch(error){codexDirty=true;$('#characterStatus').textContent='저장 실패: '+(error.message||'다시 시도해 주세요.')}
 finally{codexBusy=false;codexPanel.querySelectorAll('input,textarea,button,select').forEach(el=>el.disabled=false)}
});
window.addEventListener('beforeunload',e=>{if(codexDirty||codexBusy){e.preventDefault();e.returnValue=''}});

let behindDraft=null,behindChapterId=null,behindDirty=false,behindBusy=false,behindRange=null;
const behindFiles=new Map(),behindURLs=new Map();
const behindDialog=document.createElement('div');behindDialog.id='behindDialog';behindDialog.className='behind-backdrop hidden';
behindDialog.innerHTML=`<section class="behind-modal" role="dialog" aria-modal="true" aria-labelledby="behindHeading"><header><div><small>회차 비하인드</small><h2 id="behindHeading"></h2></div><button type="button" id="behindClose" aria-label="비하인드 닫기">×</button></header><div class="behind-toolbar"><button type="button" id="behindUpload">＋ 이미지 추가</button><span>이미지를 끌어 놓거나 붙여 넣을 수 있습니다. 최대 10MB · 같은 파일은 기존 이미지를 사용합니다.</span><input id="behindFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden></div><div class="behind-content"><div id="behindEditor" class="behind-editor" contenteditable="true" role="textbox" aria-label="비하인드 본문" aria-multiline="true" data-placeholder="회차의 비하인드를 적어 주세요…"></div><aside><h3>이미지 정보</h3><p>이미지마다 태그, 프롬프트와 설명을 저장합니다.</p><div id="behindImages"></div></aside></div><footer><span id="behindStatus" role="status" aria-live="polite"></span><button type="button" id="behindSave">저장</button></footer></section>`;
document.body.append(behindDialog);
function behindButton(ch){return `<button type="button" class="behind-open" data-behind-open="${escapeAttr(ch.id)}">${ch.behind?'비하인드 보기':'＋ 비하인드 추가'}</button>`}
function allMediaRecords(){return [...orderedSceneIds().flatMap(sceneId=>{const scene=normalizeScene(state.scenes[sceneId]);return scene.media.map(media=>({sceneId,scene,media,chapter:chapterForScene(sceneId),source:'episode'}))}),...allCards().flatMap(ch=>(ch.behind?.media||[]).map(media=>({sceneId:null,scene:ch.behind,media,chapter:ch,source:'behind'})))]}
function mediaBlobIsShared(mediaId,key){return allMediaRecords().some(item=>item.media.id!==mediaId&&(item.media.blobKey||item.media.id)===key)}
function behindChanged(){behindDirty=true;$('#behindStatus').textContent='저장하지 않은 변경 사항'}
function syncBehind(){behindDraft.bodyHtml=sanitizeStoredHtml($('#behindEditor').innerHTML);behindDraft.text=$('#behindEditor').innerText;behindChanged()}
function behindRememberRange(){const selection=getSelection();if(selection?.rangeCount&&$('#behindEditor').contains(selection.anchorNode))behindRange=selection.getRangeAt(0).cloneRange()}
function openBehind(chapterId){
 if(behindBusy||!flushSave())return;
 if(!closeCharacterPopup())return;
 const ch=allCards().find(c=>c.id===chapterId);if(!ch)return;
 behindChapterId=chapterId;behindDraft=structuredClone(ch.behind||{bodyHtml:'',text:'',media:[]});behindDraft.media??=[];behindDirty=false;behindRange=null;
 $('#behindHeading').textContent=ch.title+' · '+chapterTitleForBrowser(ch);$('#behindEditor').innerHTML=window.cleanLibraryHTML(behindDraft.bodyHtml||escapeHtml(behindDraft.text||'').replace(/\n/g,'<br>'));$('#behindStatus').textContent='';
 behindDialog.classList.remove('hidden');renderBehindImages();$('#behindEditor').focus();
}
function closeBehind(){if(behindBusy)return;if(behindDirty&&!confirm('저장하지 않은 비하인드를 버리고 닫을까요?'))return;behindDialog.classList.add('hidden');behindDraft=null;behindDirty=false;behindRange=null;behindFiles.clear();for(const url of behindURLs.values())URL.revokeObjectURL(url);behindURLs.clear();}
async function behindURL(media){if(behindURLs.has(media.id))return behindURLs.get(media.id);return mediaObjectUrl(media)}
function renderBehindImages(selectedId){
 const draft=behindDraft;if(!draft)return;
 $('#behindImages').innerHTML=draft.media.map(m=>`<article class="behind-image-card ${m.id===selectedId?'selected':''}" data-behind-image="${escapeAttr(m.id)}"><img data-behind-preview="${escapeAttr(m.id)}" alt="${escapeAttr(m.name||'비하인드 이미지')}"><b>${escapeHtml(m.name||'이미지')}</b><label>태그<input data-behind-meta="tags" data-id="${escapeAttr(m.id)}" value="${escapeAttr((m.tags||[]).join(', '))}" placeholder="쉼표로 구분"></label><label>프롬프트<textarea data-behind-meta="prompt" data-id="${escapeAttr(m.id)}">${escapeHtml(m.prompt||'')}</textarea></label><label>설명<textarea data-behind-meta="description" data-id="${escapeAttr(m.id)}">${escapeHtml(m.description||'')}</textarea></label></article>`).join('')||'<p>이미지를 추가하면 여기에 표시됩니다.</p>';
 for(const m of draft.media){behindURL(m).then(url=>{if(behindDraft!==draft)return;for(const img of [...$('#behindEditor').querySelectorAll('[data-media-id]'),...$('#behindImages').querySelectorAll('[data-behind-preview]')])if(img.dataset.mediaId===m.id||img.dataset.behindPreview===m.id)img.src=url}).catch(()=>{$('#behindStatus').textContent='이미지를 불러오지 못했습니다. 다시 열어 주세요.'})}
 if(behindBusy)$('#behindImages').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=true);
 if(selectedId){const card=[...$('#behindImages').children].find(el=>el.dataset.behindImage===selectedId);card?.scrollIntoView({block:'nearest'})}
}
function insertBehindMedia(media){
 const editor=$('#behindEditor'),fragment=document.createRange().createContextualFragment(inlineHtml(media));
 if(behindRange&&editor.contains(behindRange.commonAncestorContainer)){behindRange.deleteContents();behindRange.insertNode(fragment)}else editor.append(fragment);
 behindRange=null;syncBehind();
}
async function addBehindFiles(files){
 if(behindBusy||!behindDraft)return;behindBusy=true;$('#behindEditor').contentEditable='false';behindDialog.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);
 const notices=[];
 try{
 for(const file of files){
  if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(file.type)||file.size>10*1024*1024){notices.push(file.name+': 10MB 이하의 이미지 파일을 선택해 주세요.');continue}
  const preview=URL.createObjectURL(file),img=new Image();try{img.src=preview;await img.decode()}catch{URL.revokeObjectURL(preview);notices.push(file.name+': 읽을 수 없는 이미지입니다.');continue}
  const hash=await hashFile(file);if(!hash){URL.revokeObjectURL(preview);throw new Error('중복 검사에 실패했습니다. 다시 시도해 주세요.')}
  let same=behindDraft.media.find(m=>m.hash===hash),existing=null;
  if(!same){for(const item of allMediaRecords()){if(item.media.type==='video')continue;if(await ensureMediaHash(item.media)===hash){existing=item;break}}}
  if(same){URL.revokeObjectURL(preview);const present=[...$('#behindEditor').querySelectorAll('[data-inline-media]')].some(el=>el.dataset.inlineMedia===same.id);if(!present)insertBehindMedia(same);renderBehindImages(same.id);notices.push('중복 이미지: 기존 '+same.name+'을 표시했습니다.');continue}
  const id='behind_'+crypto.randomUUID();let media;
  if(existing){await mediaObjectUrl(existing.media);media={...existing.media,id,blobKey:existing.media.blobKey||existing.media.id,hash,tags:[...(existing.media.tags||[])],description:existing.media.description||''};delete media.src;URL.revokeObjectURL(preview);notices.push('중복 이미지: '+existing.chapter.title+'의 기존 이미지를 가져왔습니다.');}
  else{media={id,blobKey:id,name:file.name,type:file.type==='image/gif'?'gif':'image',hash,tags:[],prompt:'',description:''};behindFiles.set(id,file);behindURLs.set(id,preview);notices.push(file.name+' 추가됨');}
  behindDraft.media.push(media);insertBehindMedia(media);renderBehindImages(id);
 }
 }catch(error){notices.push('추가 실패: '+error.message)}
 finally{behindBusy=false;$('#behindEditor').contentEditable='true';behindDialog.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false);$('#behindStatus').textContent=notices.join(' ')}
}
$('#behindUpload').onclick=()=>$('#behindFile').click();
$('#behindFile').onchange=e=>{const files=[...e.target.files];e.target.value='';addBehindFiles(files)};
$('#behindEditor').addEventListener('input',syncBehind);
['keyup','mouseup','focus','blur'].forEach(type=>$('#behindEditor').addEventListener(type,behindRememberRange));
$('#behindEditor').addEventListener('dragover',e=>e.preventDefault());
$('#behindEditor').addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)addBehindFiles([...e.dataTransfer.files])});
$('#behindEditor').addEventListener('paste',e=>{e.preventDefault();const files=[...e.clipboardData.files];if(files.length){addBehindFiles(files);return}const selection=getSelection();if(selection?.rangeCount){const range=selection.getRangeAt(0);range.deleteContents();const text=document.createTextNode(e.clipboardData.getData('text/plain'));range.insertNode(text);range.setStartAfter(text);range.collapse(true);selection.removeAllRanges();selection.addRange(range);syncBehind()}});
$('#behindImages').addEventListener('input',e=>{const el=e.target,m=behindDraft?.media.find(x=>x.id===el.dataset.id);if(!m||!el.dataset.behindMeta)return;m[el.dataset.behindMeta]=el.dataset.behindMeta==='tags'?codexTerms(el.value):el.value;behindChanged()});
$('#behindClose').onclick=closeBehind;
$('#behindSave').onclick=async()=>{
 if(behindBusy||!behindDraft)return;syncBehind();behindBusy=true;$('#behindEditor').contentEditable='false';behindDialog.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=true);$('#behindStatus').textContent='저장 중…';
 try{for(const [id,file] of behindFiles){await idbPut(id,file);behindFiles.delete(id)}const ch=allCards().find(c=>c.id===behindChapterId);if(!ch)throw new Error('회차를 찾을 수 없습니다.');ch.behind=structuredClone(behindDraft);if(!save())throw new Error('저장할 수 없습니다.');await window.libraryCloud.flush();behindDirty=false;renderEpisodesBrowser();renderGallery();$('#behindStatus').textContent='클라우드에 저장했습니다.';}catch(error){$('#behindStatus').textContent='저장 실패: '+error.message}finally{behindBusy=false;$('#behindEditor').contentEditable='true';behindDialog.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=false)}
};
document.addEventListener('keydown',e=>{if(behindDialog.classList.contains('hidden'))return;if(e.key==='Escape'){e.preventDefault();closeBehind()}if(e.key==='Tab'){const items=[...behindDialog.querySelectorAll('button:not(:disabled),input:not([hidden]):not(:disabled),textarea:not(:disabled),[contenteditable="true"]')],first=items[0],last=items.at(-1);if(!first){e.preventDefault();return}if(e.shiftKey&&(document.activeElement===first||!behindDialog.contains(document.activeElement))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(document.activeElement===last||!behindDialog.contains(document.activeElement))){e.preventDefault();first.focus()}}});
window.addEventListener('beforeunload',e=>{if(behindDirty||behindBusy){e.preventDefault();e.returnValue=''}});

if(document.modelContext?.registerTool){
  try{Promise.resolve(document.modelContext.registerTool({name:'list_novels',description:'List the novels shown in this browser’s library.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object');return {novels:allNovels().map(({id,title,author,series})=>({id,title,author,series}))}}})).catch(()=>{})}catch(e){}
}
(async()=>{
  // Cloud data is loaded by bootstrap before this script starts.
  renderAll();renderSidebar();
  if(location.hash.startsWith('#novel')){let id=decodeURIComponent(location.hash.split('/')[1]||'legacy');if(!allNovels().some(n=>n.id===id))id=allNovels()[0]?.id;if(id)openNovel(id)}
})();
})();
