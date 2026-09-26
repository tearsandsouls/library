import {createClient} from '@supabase/supabase-js';
import DOMPurify from 'dompurify';
window.cleanLibraryHTML=html=>DOMPurify.sanitize(html,{ADD_ATTR:['contenteditable','data-inline-media','data-media-id','data-media-src'],FORBID_TAGS:['style','iframe','object','embed'],FORBID_ATTR:['style']});
window.cleanLibraryTemplate=html=>DOMPurify.sanitize(html,{ADD_ATTR:['contenteditable'],FORBID_TAGS:['style','iframe','object','embed']});
const $=s=>document.querySelector(s);
const config=window.LIBRARY_CONFIG||{};
const message=text=>$('#authMessage').textContent=text;
let cloud=null,client=null,loadedUser=null;
function showStatus(status){
 const text=status.error?(status.conflict?status.error:'저장 실패 · 연결을 확인하고 다시 시도하세요'):status.pending?'클라우드에 저장 중…':'● 클라우드 저장됨';
 $('#cloudStatus').textContent=text;
 const state=$('#saveState');if(state)state.textContent=text;
 $('#cloudRetry').hidden=!status.error||status.conflict;
}
async function clearLegacy(){
 const exact=new Set(['storyloom_v17_duplicate_demo','storyloom_created_novels_v1','storyloom_created_series_v1','storyloom_sample_metadata_v2','storyloom_v31_media_reset_done']);
 for(const key of Object.keys(localStorage))if(exact.has(key)||key.startsWith('storyloom_novel_v2_'))localStorage.removeItem(key);
 await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase('storyloom_media_v1');req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('이전 서재 탭을 닫고 다시 시도해 주세요.'))});
}
async function start(session){
 if(!session){$('#authScreen').hidden=false;$('#libraryApp').hidden=true;return}
 if(loadedUser){if(loadedUser!==session.user.id)location.reload();return}
 message('서재를 불러오는 중…');
 try{
  const seed=await client.rpc('seed_library_demo');if(seed.error)throw seed.error;
  cloud=new window.CloudStore(client,session.user,showStatus);await cloud.load();
  // The user requested a fresh start. Only this app's legacy storage is removed,
  // after authenticated cloud initialization succeeds; new auth tokens are untouched.
  await clearLegacy();
  window.libraryStore=cloud;window.libraryCloud=cloud;loadedUser=session.user.id;
  const script=document.createElement('script');script.src='assets/js/app.js';
  await new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=()=>reject(new Error('앱 파일을 불러오지 못했습니다.'));document.body.append(script)});
  $('#authScreen').hidden=true;$('#libraryApp').hidden=false;$('#accountEmail').textContent=session.user.email||'';showStatus({pending:0});
 }catch(e){loadedUser=null;message('연결하지 못했습니다: '+e.message)}
}
$('#cloudRetry').onclick=()=>cloud?.flush().catch(()=>{});
$('#signOut').onclick=async()=>{
 try{window.libraryFlush?.();await cloud?.flush();if(cloud?.unsaved)return;const {error}=await client.auth.signOut();if(error)throw error;location.reload()}catch(e){$('#cloudStatus').textContent='저장 또는 로그아웃 실패: '+e.message}
};
window.addEventListener('beforeunload',e=>{if(cloud?.unsaved){e.preventDefault();e.returnValue=''}});
window.addEventListener('online',()=>cloud?.flush().catch(()=>{}));
$('#loginForm').onsubmit=async e=>{
 e.preventDefault();$('#loginSubmit').disabled=true;message('로그인 중…');
 try{const {data,error}=await client.auth.signInWithPassword({email:$('#loginEmail').value.trim(),password:$('#loginPassword').value});if(error)throw error;$('#loginPassword').value='';await start(data.session)}catch(e){message('로그인 실패: '+e.message)}finally{$('#loginSubmit').disabled=false}
};
try{
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl)||!config.supabasePublishableKey)throw new Error('Supabase 설정이 필요합니다. 배포 안내에 따라 프로젝트 URL과 Publishable key를 설정해 주세요.');
 const key=config.supabasePublishableKey;
 if(key.startsWith('sb_secret_'))throw new Error('관리자 비밀 키를 사용할 수 없습니다. Publishable key를 사용하세요.');
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw new Error('invalid')}catch{throw new Error('공개 anon 키만 사용할 수 있습니다.')}}
 client=createClient(config.supabaseUrl,key);
 client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){$('#libraryApp').hidden=true;$('#authScreen').hidden=false;loadedUser=null;location.reload()}if(event==='SIGNED_IN'&&loadedUser&&session.user.id!==loadedUser)location.reload()});
 const {data,error}=await client.auth.getSession();if(error)throw error;await start(data.session);
}catch(e){message(e.message);$('#loginSubmit').disabled=true}
