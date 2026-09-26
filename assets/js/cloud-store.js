/* Cloud document store. Owner isolation is enforced by SQL RLS, not these filters. */
(function(root){
class CloudStore {
  constructor(client,user,onStatus=()=>{}){this.client=client;this.user=user;this.onStatus=onStatus;this.records=new Map();this.pending=new Map();this.deletes=new Map();this.running=null;this.failure=null;this.conflicted=false;this.generation=0;this.acknowledged=0}
  async load(){const {data,error}=await this.client.from('library_documents').select('key,payload,revision');if(error)throw error;for(const r of data)this.records.set(r.key,{value:JSON.stringify(r.payload),revision:r.revision});this.status()}
  getItem(key){return this.records.get(key)?.value??null}
  setItem(key,value){if(this.conflicted)throw new Error('다른 창에서 변경되었습니다. 새로고침 전 현재 원고를 복사해 주세요.');const payload=JSON.parse(value);const old=this.records.get(key);this.records.set(key,{value,revision:old?.revision??0});this.pending.set(key,{payload,generation:++this.generation});this.status();void this.flush().catch(()=>{})}
  status(){this.onStatus({pending:this.pending.size+this.deletes.size+(this.running?1:0),error:this.failure,conflict:this.conflicted})}
  async flush(){
    if(this.running)return this.running;
    if(this.conflicted)throw new Error(this.failure);
    this.failure=null;
    this.running=this.drain();this.status();
    try{await this.running}catch(e){this.failure=e.message||String(e);this.status();throw e}finally{this.running=null;this.status()}
  }
  async drain(){
    while(this.pending.size){
      const [key,job]=this.pending.entries().next().value;const revision=this.records.get(key).revision;
      const row={owner_id:this.user.id,key,payload:job.payload,revision:revision+1};
      let result;
      if(revision===0)result=await this.client.from('library_documents').insert(row).select('revision');
      else result=await this.client.from('library_documents').update({payload:job.payload,revision:revision+1}).eq('owner_id',this.user.id).eq('key',key).eq('revision',revision).select('revision');
      if(result.error){if(result.error.code==='23505')this.conflicted=true;throw new Error(this.conflicted?'다른 창과 저장 내용이 충돌했습니다. 현재 원고를 복사하고 새로고침해 주세요.':result.error.message)}
      if(!result.data?.length){this.conflicted=true;throw new Error('다른 창과 저장 내용이 충돌했습니다. 현재 원고를 복사하고 새로고침해 주세요.')}
      this.records.get(key).revision=result.data[0].revision;this.acknowledged=Math.max(this.acknowledged,job.generation);
      if(this.pending.get(key)?.generation===job.generation)this.pending.delete(key);
    }
    // Scene metadata is saved first. An interrupted removal may leave an unused file,
    // but never a saved scene pointing at a file we already removed.
    for(const [key,barrier] of this.deletes){if(this.acknowledged<barrier)continue;const {error}=await this.client.storage.from('library-media').remove([this.path(key)]);if(error)throw error;this.deletes.delete(key)}
  }
  path(key){if(!/^[\w.-]+$/.test(key))throw new Error('유효하지 않은 미디어 ID');return `${this.user.id}/${key}`}
  async putMedia(key,blob){const {error}=await this.client.storage.from('library-media').upload(this.path(key),blob,{contentType:blob.type||'application/octet-stream',upsert:false});if(error)throw error}
  async getMedia(key){const {data,error}=await this.client.storage.from('library-media').download(this.path(key));if(error)throw error;return data}
  removeMedia(key){this.deletes.set(key,this.generation+1);this.status()}
  get unsaved(){return !!(this.pending.size||this.deletes.size||this.running)}
}
root.CloudStore=CloudStore;
if(typeof module!=='undefined')module.exports=CloudStore;
})(typeof window==='undefined'?globalThis:window);
