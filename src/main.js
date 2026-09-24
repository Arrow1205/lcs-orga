import {createClient} from '@supabase/supabase-js';
import {startCRM} from './crm.js';
import {mountEditions} from './editions.js';
import {RecordSync} from './records.js';
import './crm.css';
import './cloud.css';
const $=id=>document.getElementById(id);
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let client,api,sync,workspaceId,role,userId,editionYear,busy=false,poll,recovering=location.hash.includes('recovery');
const status=text=>{$('syncStatus').textContent=text;};
function downloadJSON(data,name){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);}
function recovery(error,snapshot){
 status(error.code==='40001'?'Conflit : enregistrement arrêté':'Enregistrement interrompu');$('crmRoot').inert=true;
 const box=$('cloudError');box.hidden=false;box.replaceChildren();
 const p=document.createElement('p');p.textContent=error.code==='40001'?'Une autre personne a enregistré des modifications. Ta version n’a pas écrasé la sienne. Télécharge ta copie avant de recharger.':'La modification n’a pas été confirmée par le serveur. Garde cet onglet ouvert ou télécharge ta copie.';box.append(p);
 const backup=document.createElement('button');backup.textContent='Télécharger ma copie non synchronisée';backup.onclick=()=>downloadJSON({format:'lcs-recovery',workspaceId,editionYear,revision:sync.revision,state:snapshot},'lcs.recovery.json');box.append(backup);
 if(error.code!=='40001'){const retry=document.createElement('button');retry.textContent='Réessayer';retry.onclick=()=>{box.hidden=true;$('crmRoot').inert=false;sync.retry();};box.append(retry);}
 const reload=document.createElement('button');reload.textContent='Recharger la version partagée';reload.onclick=()=>{if(confirm('As-tu conservé ta copie locale ? Les changements non synchronisés de cet onglet seront abandonnés.')){sync.blocked=false;sync.pending=null;location.reload();}};box.append(reload);
}
const forbidden='[data-add],[data-delete],[data-add-goodie],[data-remove-goodie],[data-partner-invoice],[data-accept-zone],[data-extra-add],[data-extra-delete],[data-owner-delete],[data-select-exhibitor],#selectAll,[data-cal-add]';
function protectViewer(){if(role!=='viewer')return;
 const root=$('crmRoot');
 function refresh(){root.querySelectorAll(forbidden).forEach(el=>el.hidden=true);root.querySelectorAll('input,select,textarea').forEach(el=>{if(!el.matches('#search,.column-filter,[data-column],#zoneFilter,#statusFilter'))el.disabled=true;});root.querySelectorAll('form button').forEach(el=>{if(!el.matches('[data-close]'))el.disabled=true;});root.querySelectorAll('[data-action]').forEach(el=>{if(!['finance-detail'].includes(el.dataset.action))el.hidden=true;});}
 document.addEventListener('submit',e=>{if(root.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
 new MutationObserver(refresh).observe(root,{childList:true,subtree:true});refresh();
}
function login(message=''){
 $('loginScreen').hidden=false;$('crmRoot').hidden=true;$('cloudBar').hidden=true;
 $('loginScreen').innerHTML='<form class="login-card" id="loginForm"><h1>Lille Card Show</h1><p>Connecte-toi à l’espace de l’équipe.</p><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required></label><button>Se connecter</button><p id="loginMessage"></p><button type="button" id="resetPassword">Mot de passe oublié</button></form>';
 $('loginMessage').textContent=message;
 $('loginForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);$('loginMessage').textContent='Connexion…';try{const {error}=await client.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error)throw error;location.reload();}catch(err){$('loginMessage').textContent='Connexion impossible : '+err.message;}};
 $('resetPassword').onclick=async()=>{const email=$('loginForm').elements.email.value;if(!email){$('loginMessage').textContent='Renseigne ton email.';return;}const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/#recovery'});$('loginMessage').textContent=error?error.message:'Si le compte existe, un lien de réinitialisation sera envoyé.';};
}
async function passwordScreen(){
 $('loginScreen').hidden=false;$('loginScreen').innerHTML='<form class="login-card" id="newPasswordForm"><h1>Nouveau mot de passe</h1><label>Mot de passe<input name="password" type="password" minlength="12" required autocomplete="new-password"></label><button>Enregistrer</button><p id="loginMessage"></p></form>';
 $('newPasswordForm').onsubmit=async e=>{e.preventDefault();const {error}=await client.auth.updateUser({password:String(new FormData(e.target).get('password'))});if(error){$('loginMessage').textContent=error.message;return;}location.replace(location.origin);};
}
async function loadState(){const {data,error}=await client.rpc('crm_read_records',{p_workspace:workspaceId,p_year:editionYear});if(error)throw error;return data;}
async function boot(){
 const {data:{session},error}=await client.auth.getSession();if(error)throw error;if(!session){login();return;}
 if(recovering||location.hash.includes('recovery')){await passwordScreen();return;}
 userId=session.user.id;
 const {data:members,error:memberError}=await client.from('crm_members').select('workspace_id,role').eq('user_id',userId);if(memberError)throw memberError;
 if(members.length!==1)throw Error(members.length?'Ce paquet V1 attend un seul espace par compte.':'Ton compte n’a pas encore accès au salon. Exécuter le script d’ajout du membre dans Supabase.');
 ({workspace_id:workspaceId,role}=members[0]);
 const {data:editions,error:editionsError}=await client.from('crm_editions').select('year').eq('workspace_id',workspaceId).order('year');if(editionsError)throw editionsError;
 const years=editions.map(e=>Number(e.year));if(!years.length)throw Error('Aucune édition : appliquer la migration 003.');
 const yearKey='lcs-active-edition:'+workspaceId+':'+userId,preferred=Number(sessionStorage.getItem(yearKey));editionYear=years.includes(preferred)?preferred:Math.max(...years);
 const initial=await loadState();
 const selectYear=year=>{sessionStorage.setItem(yearKey,String(year));location.reload();};
 mountEditions({host:$('editionPicker'),years,selected:editionYear,canCreate:role!=='viewer',onSelect:selectYear,
  canLeave:()=>{if(sync?.dirty||busy||$('overlay').innerHTML){alert('Enregistre ou ferme la fiche ouverte et attends la fin de la synchronisation avant de changer d’année.');return false;}return true;},
  onCreate:async year=>{busy=true;try{const {error}=await client.rpc('crm_create_edition',{p_workspace:workspaceId,p_year:year});if(error)throw error;selectYear(year);}finally{busy=false;}}
 });
 document.querySelector('.side-bottom').textContent='ÉDITION '+editionYear+' · Espace de pilotage';
 $('loginScreen').hidden=true;$('crmRoot').hidden=false;$('cloudBar').hidden=false;$('cloudUser').textContent=`${session.user.email} · ${role==='viewer'?'Lecture seule':role==='admin'?'Administrateur':'Éditeur'}`;
 const draftPrefix='lcs-v2-draft:'+workspaceId+':'+userId+':'+editionYear+':',draftKey=draftPrefix+crypto.randomUUID();
 sync=new RecordSync({initial,write:async(request,changes)=>{const {data:next,error}=await client.rpc('crm_apply_changes',{p_workspace:workspaceId,p_request:request,p_changes:changes,p_year:editionYear});if(error)throw error;return next;},onStatus:status,onError:recovery,
  persist:journal=>localStorage.setItem(draftKey,JSON.stringify({...journal,editionYear})),clear:()=>localStorage.removeItem(draftKey)});
 // Seules les modifications non acquittées restent dans le journal de secours.
 const drafts=Object.keys(localStorage).filter(k=>k.startsWith(draftPrefix));
 if(drafts.length){const box=$('cloudError');box.hidden=false;const message=document.createElement('p');message.textContent='Des modifications non confirmées subsistent dans ce navigateur (éventuellement un autre onglet ouvert). Télécharge-les avant de les supprimer.';box.append(message);
  for(const key of drafts){const row=document.createElement('div'),get=document.createElement('button'),remove=document.createElement('button');get.textContent='Télécharger la copie de récupération';get.onclick=()=>downloadJSON(JSON.parse(localStorage.getItem(key)),'lcs-modifications-non-confirmees.json');remove.textContent='Retirer cette copie';remove.onclick=()=>{if(confirm('Copie téléchargée ou modifications vérifiées sur le serveur ?')){localStorage.removeItem(key);row.remove();}};row.append(get,remove);box.append(row);}
 }

 const storage=client.storage.from('lcs-private');
 const backend={year:editionYear,save(data){if(role==='viewer'){status('Lecture seule');return;}sync.enqueue(data);},
  async putBlob(id,blob){if(role==='viewer')throw Error('Lecture seule');if(blob.size>50*1024*1024)throw Error('Maximum 50 Mo par fichier');const {error}=await storage.upload(`${workspaceId}/${id}`,blob,{upsert:false,contentType:blob.type||'application/octet-stream'});if(error)throw error;},
  async getBlob(id){const {data,error}=await storage.download(`${workspaceId}/${id}`);if(error)throw error;return data;}
 };
 protectViewer();api=startCRM(initial.data,backend);status('À jour');
 $('logoutCloud').onclick=async()=>{if(sync.dirty||busy){alert('Termine la synchronisation ou télécharge ta copie avant de te déconnecter.');return;}clearInterval(poll);await client.auth.signOut();location.reload();};
 $('refreshCloud').onclick=()=>{if(!sync.dirty&&!busy)location.reload();};
 poll=setInterval(async()=>{if(sync.dirty||busy||document.hidden)return;try{const next=await loadState();if(sync.dirty||busy)return;if(Number(next.revision)===sync.revision&&!sync.refreshNeeded)return;if(!$('overlay').innerHTML&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||'')){if(!sync.accept(next))return;api.replaceState(next.data);status('Actualisé');}else{$('refreshCloud').hidden=false;status('Une mise à jour est disponible');}}catch{status('Connexion à vérifier');}},15000);
 window.addEventListener('beforeunload',e=>{if(sync.dirty||busy){e.preventDefault();e.returnValue='';}});
}
if(!url||!key){$('loginScreen').innerHTML='<div class="login-card"><h1>Configuration manquante</h1><p>Ajouter VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY puis relancer le build.</p></div>';}else{
 client=createClient(url,key);client.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){recovering=true;passwordScreen();}if(event==='SIGNED_OUT'&&api)location.reload();});
 boot().catch(error=>login(error.message));
}
