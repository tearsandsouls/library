import {build} from 'esbuild';
import {cp,mkdir,writeFile,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');await cp('assets','dist/assets',{recursive:true});
if(process.env.SUPABASE_URL||process.env.SUPABASE_PUBLISHABLE_KEY){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY)throw new Error('Both Supabase variables are required');
 if(process.env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_'))throw new Error('Secret keys must never be bundled');
 await writeFile('dist/assets/js/config.js','window.LIBRARY_CONFIG = '+JSON.stringify({supabaseUrl:process.env.SUPABASE_URL,supabasePublishableKey:process.env.SUPABASE_PUBLISHABLE_KEY})+';\n');
}
await build({entryPoints:['assets/js/bootstrap.js'],bundle:true,format:'esm',outfile:'dist/assets/js/bootstrap.js',minify:true,target:['es2022']});
await writeFile('dist/.nojekyll','');
