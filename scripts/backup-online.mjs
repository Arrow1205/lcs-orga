// node --env-file=.env.local scripts/backup-online.mjs
// Renseigner LCS_EMAIL et LCS_PASSWORD dans l'environnement, pas dans Git.
import {createClient} from '@supabase/supabase-js';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const env=process.env;
for(const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','LCS_EMAIL','LCS_PASSWORD'])if(!env[key])throw Error('Variable manquante : '+key);
const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=({data,error})=>{if(error)throw error;return data;};
try{
 const auth=check(await client.auth.signInWithPassword({email:env.LCS_EMAIL,password:env.LCS_PASSWORD}));
 const members=check(await client.from('crm_members').select('workspace_id,role').eq('user_id',auth.user.id));
 if(members.length!==1||members[0].role!=='admin')throw Error('Utilise un compte administrateur du CRM.');
 const workspace=members[0].workspace_id;
 const editions=check(await client.from('crm_editions').select('year').eq('workspace_id',workspace).order('year'));
 const snapshots=[];for(const edition of editions)snapshots.push({year:edition.year,...check(await client.rpc('crm_read_records',{p_workspace:workspace,p_year:edition.year}))});
 const dir=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(dir,{recursive:true});
 await writeFile(resolve(dir,'crm.json'),JSON.stringify({workspace,editions:snapshots},null,2),{mode:0o600});
 const history=[];for(let from=0;;from+=1000){const page=check(await client.from('crm_history').select('*').eq('workspace_id',workspace).order('id').range(from,from+999));history.push(...page);if(page.length<1000)break;}
 await writeFile(resolve(dir,'history.json'),JSON.stringify(history),{mode:0o600});
 const ids=new Set();function scan(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(['blobId','logoId','imageId'].includes(key)&&typeof child==='string'&&child)ids.add(child);else scan(child);}}
 scan(snapshots);scan(history);
 const manifest=[];await mkdir(resolve(dir,'files'));
 for(const id of ids){const file=check(await client.storage.from('lcs-private').download(workspace+'/'+id));const bytes=Buffer.from(await file.arrayBuffer()),name=String(manifest.length+1);await writeFile(resolve(dir,'files',name),bytes,{mode:0o600});manifest.push({id,file:'files/'+name,type:file.type,sha256:createHash('sha256').update(bytes).digest('hex')});}
 await writeFile(resolve(dir,'files.json'),JSON.stringify(manifest,null,2),{mode:0o600});
 await writeFile(resolve(dir,'COMPLETE.txt'),'Sauvegarde complète : '+manifest.length+' fichiers.\n',{mode:0o600});
 console.log('Sauvegarde terminée : '+dir);
}finally{await client.auth.signOut();}
