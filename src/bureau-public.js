import {createClient} from '@supabase/supabase-js';
import {createBureau} from './bureau.js';
import './crm.css';import './design.css';import './bureau.css';
const root=document.getElementById('bureauPublic');
async function boot(){
 const code=new URLSearchParams(location.search).get('code');if(!/^[0-9a-f-]{36}$/i.test(code||''))throw Error('Lien de questionnaire invalide.');
 const client=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),cacheKey='lcs-bureau-public:'+code;
 let identity;try{identity=JSON.parse(localStorage.getItem(cacheKey)||'null')}catch{}
 if(!identity?.participant_id||!identity?.resume_token){identity={participant_id:crypto.randomUUID(),resume_token:crypto.randomUUID(),name:''};try{localStorage.setItem(cacheKey,JSON.stringify(identity))}catch{throw Error('Autorise le stockage de ce navigateur pour pouvoir retrouver ton bilan.')}}
 const request=async(action,values={})=>{const {data,error}=await client.rpc('crm_bureau_public',{p_code:code,p_action:action,p_values:{participant_id:identity.participant_id,resume_token:identity.resume_token,...values}});if(error)throw error;return data};
 const initial=await request('read');let module;
 const cloud={publicMode:true,year:initial.year,userId:identity.participant_id,workspaceId:code,authorName:identity.name||initial.responses[0]?.author_name||'',role:'respondent',closed:initial.closed,members:[],copyYears:[],saveAuthor(name){identity.name=name;localStorage.setItem(cacheKey,JSON.stringify(identity))},bureauRequest:request};
 const render=()=>{root.innerHTML=module.markup();module.mount()};module=createBureau({cloud,getDB:()=>({tasks:[]}),render,isVisible:()=>true,readonly:()=>cloud.closed,onTask:()=>{},onOpenTask:()=>{}});render();
}
boot().catch(error=>{root.replaceChildren();const panel=document.createElement('section');panel.className='panel';panel.textContent=error.message||'Questionnaire indisponible.';root.append(panel)});
