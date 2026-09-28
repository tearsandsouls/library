import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {cp,mkdir,writeFile,readFile,rename,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');await cp('assets','dist/assets',{recursive:true});
if(process.env.SUPABASE_URL||process.env.SUPABASE_PUBLISHABLE_KEY){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)throw new Error('Both Supabase variables are required');
 if(process.env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_'))throw new Error('Secret keys must never be bundled');
 await writeFile('dist/assets/js/config.js','window.LIBRARY_CONFIG = '+JSON.stringify({supabaseUrl:process.env.SUPABASE_URL,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY})+';\n');
}
await build({entryPoints:['assets/js/bootstrap.js'],bundle:true,format:'esm',outfile:'dist/assets/js/bootstrap.js',minify:true,target:['es2022']});
await writeFile('dist/.nojekyll','');

// Content-addressed assets prevent browsers from reusing an older release.
async function fingerprint(path){
 const content=await readFile('dist/'+path);
 const hash=createHash('sha256').update(content).digest('hex').slice(0,12);
 const versioned=path.replace(/(\.[^/.]+)$/,'.'+hash+'$1');
 await rename('dist/'+path,'dist/'+versioned);
 return versioned;
}
const appPath=await fingerprint('assets/js/app.js');
const bootstrapPath='dist/assets/js/bootstrap.js';
await writeFile(bootstrapPath,(await readFile(bootstrapPath,'utf8')).replace('assets/js/app.js',appPath));
let html=await readFile('dist/index.html','utf8');
for(const path of ['assets/css/app.css','assets/js/config.js','assets/js/cloud-store.js','assets/js/bootstrap.js']){
 html=html.replaceAll(path,await fingerprint(path));
}
await writeFile('dist/index.html',html);
