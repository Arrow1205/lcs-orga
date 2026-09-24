import {defineConfig,loadEnv} from 'vite';
export default defineConfig(({command,mode})=>{
 const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
 if(command==='build'){
  if(!/^https:\/\/[a-z0-9.-]+/.test(env.VITE_SUPABASE_URL||''))throw Error('VITE_SUPABASE_URL manque ou est invalide.');
  if(!env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))throw Error('Définir VITE_SUPABASE_PUBLISHABLE_KEY (clé publique Supabase).');
 }
 return {build:{target:'es2022'}};
});
