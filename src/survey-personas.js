import {communityValues,answerFor,questionFor} from './visitor-feedback.js';
import {normalizeVerbatim,groupComments} from './feedback-themes.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeNames={visiteur:'Visiteur',vip:'VIP / Early Access',exposant:'Exposant / partenaire'};
const known=[['returnIntent','Envie de revenir'],['age','Âge'],['gender','Genre'],['ticket','Type de visiteur'],['purchase','Achats'],['duration','Temps passé'],['discovery','Découverte du salon'],['spend','Panier moyen'],['companions','Contexte de venue'],['satisfaction','Satisfaction globale'],['highlights','Point fort'],['improvements','Point de friction']];
const fallback=[['premiumType','Billet'],['participation','Participation'],['vendorType','Type d’exposant'],['zone','Zone'],['premiumValue','Valeur du billet']];
const excluded=/\b(nom|prenom|identite|societe|telephone|email|mail|contact|adresse)\b/;
const scalar=value=>typeof value==='string'&&value.trim()?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):null;
const list=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):scalar(value)?[scalar(value)]:[];

function responses(row){
 const values=new Map([['type',{label:'Formulaire',value:typeNames[row.type]||row.type,priority:0}]]);
 const communities=communityValues(row).filter(Boolean);
 if(communities.length)values.set('community',{label:'Communauté',value:communities.sort((a,b)=>a.localeCompare(b,'fr')).join(' · '),priority:1,multi:communities});
 for(const [index,[field,label]] of known.entries()){
  const raw=answerFor(row,field),items=list(raw);
  if(items.length)values.set(field,{label,value:items.join(' · '),priority:index+2,multi:items});
 }
 for(const [index,[key,label]] of fallback.entries()){
  const items=list(row.answers?.[key]);
  if(items.length)values.set(key,{label,value:items.join(' · '),priority:index+known.length+2,multi:items});
 }
 for(const question of row.questions||[]){
  if(!['choice','dropdown','checkbox','rating','rating10'].includes(question.kind)||excluded.test(normalizeVerbatim(question.label)))continue;
  if(known.some(([field])=>questionFor(row,field)?.key===question.key)||questionFor(row,'community')?.key===question.key)continue;
  const items=list(row.answers?.[question.key]).sort((a,b)=>a.localeCompare(b,'fr'));
  if(!items.length)continue;
  const label=String(question.label||question.key).trim();
  const id='q:'+normalizeVerbatim(label);
  if(!values.has(id))values.set(id,{label,value:items.join(' · '),priority:100,multi:items});
 }
 return values;
}

const rawValue=(record,key)=>record.values.get(key)?.value;
const valuesFor=(record,key)=>record.values.get(key)?.multi||list(rawValue(record,key));
function splitCandidate(records){
 const keys=[...new Set(records.flatMap(record=>[...record.values.keys()]))];
 let best=null;
 for(const key of keys){
  if(records.some(record=>!rawValue(record,key)))continue;
  const counts=new Map();
  for(const record of records)for(const value of valuesFor(record,key))counts.set(value,(counts.get(value)||0)+1);
  for(const [value,count] of counts){
   if(count<2||records.length-count<2)continue;
   const priority=records[0].values.get(key)?.priority??100;
   const candidate={key,value,priority,balance:Math.min(count,records.length-count)};
   if(!best||priority<best.priority||priority===best.priority&&candidate.balance>best.balance||priority===best.priority&&candidate.balance===best.balance&&`${key}:${value}`.localeCompare(`${best.key}:${best.value}`,'fr')<0)best=candidate;
  }
 }
 return best;
}

function segment(records,target){
 if(records.length<2)return [];
 const groups=[records];
 while(groups.length<target){
  const candidates=groups.map((group,index)=>({index,group,split:splitCandidate(group)})).filter(item=>item.split).sort((a,b)=>b.group.length-a.group.length||a.index-b.index);
  if(!candidates.length)break;
  const {index,group,split}=candidates[0];
  const matches=item=>valuesFor(item,split.key).includes(split.value);
  const left=group.filter(matches),right=group.filter(item=>!matches(item));
  groups.splice(index,1,left,right);
 }
 return groups.sort((a,b)=>b.length-a.length);
}

function counts(records,key){
 const map=new Map();let answered=0;
 for(const record of records){
  const values=valuesFor(record,key).filter(Boolean);
  if(!values.length)continue;
  answered++;
  for(const value of new Set(values))map.set(value,(map.get(value)||0)+1);
 }
 return {answered,entries:[...map].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'))};
}
function dominant(records,key){
 const result=counts(records,key),entry=result.entries[0];
 if(!entry)return null;
 return {label:records.find(r=>r.values.has(key))?.values.get(key).label||key,value:entry[0],count:entry[1],answered:result.answered,priority:records.find(r=>r.values.has(key))?.values.get(key).priority??100};
}
function facts(records){
 const keys=[...new Set(records.flatMap(record=>[...record.values.keys()]))];
 return keys.map(key=>{
  const fact=dominant(records,key);
  if(!fact||fact.count<2||fact.count/fact.answered<=.5)return null;
  return {...fact,key};
 }).filter(Boolean).sort((a,b)=>a.priority-b.priority||b.count-a.count).slice(0,14);
}
function moneyValue(value){
 const text=String(value??'').replace(/,/g,'.');
 const nums=[...text.matchAll(/\d+(?:\.\d+)?/g)].map(x=>Number(x[0])).filter(Number.isFinite);
 if(!nums.length)return null;
 if(/plus|\+/.test(text))return nums[0];
 return nums.length>=2?(nums[0]+nums[1])/2:nums[0];
}
function averageSpend(records){
 const values=records.map(record=>moneyValue(rawValue(record,'spend'))).filter(value=>Number.isFinite(value));
 if(!values.length)return null;
 return Math.round(values.reduce((sum,value)=>sum+value,0)/values.length/5)*5;
}
function phraseJoin(values){
 const unique=[...new Set(values.filter(Boolean))];
 if(unique.length<=1)return unique[0]||'';
 return `${unique.slice(0,-1).join(', ')} et ${unique.at(-1)}`;
}
const maleNames=['Alex','Samir','Julien','Thomas','Mehdi','Maxime'];
const femaleNames=['Géraldine','Camille','Nora','Inès','Lina','Laura'];
const neutralNames=['Alex','Camille','Samir','Nora','Julien','Inès','Thomas','Lina','Mehdi','Laura'];
const maleImages=['/personas/men1.png','/personas/men2.png','/personas/men3.png'];
const femaleImages=['/personas/women1.png','/personas/women2.png','/personas/women3.png'];
function friction(records){
 const comments=records.map(record=>answerFor(record.row,'improvements')).filter(value=>typeof value==='string'&&value.trim());
 if(!comments.length)return null;
 const group=groupComments(comments,'improvements')[0];
 if(!group)return null;
 const quote=(group.quotes?.[0]?.text||'').replace(/[.!?]+$/,'');
 return {theme:group.name,quote,count:group.count,total:comments.length};
}
function returnPhrase(value){
 const normalized=normalizeVerbatim(value);
 if(normalized==='oui')return 'est convaincu de revenir l’an prochain';
 if(normalized.includes('peut etre'))return 'pourrait revenir l’an prochain';
 if(normalized==='non')return 'n’est pas encore convaincu de revenir';
 return value?`a répondu « ${value} » sur son envie de revenir`:'';
}
function ageFromBucket(value,index){
 const nums=[...String(value??'').matchAll(/\d+/g)].map(x=>Number(x[0]));
 if(nums.length>=2){const min=nums[0],max=nums[1];return Math.min(max,Math.max(min,min+Math.round((max-min)*((index%5)+1)/6)));}
 return nums[0]||null;
}
function profileName(gender,index){
 const n=normalizeVerbatim(gender);
 if(n.includes('femme'))return femaleNames[index%femaleNames.length];
 if(n.includes('homme'))return maleNames[index%maleNames.length];
 return neutralNames[index%neutralNames.length];
}
function profileImage(gender,index){
 const n=normalizeVerbatim(gender);
 if(n.includes('femme'))return femaleImages[index%femaleImages.length];
 if(n.includes('homme'))return maleImages[index%maleImages.length];
 return [...maleImages,...femaleImages][index%6];
}
function discoveryPhrase(value){
 const n=normalizeVerbatim(value);
 if(/deja venu|precedente edition|edition precedente|lan dernier|annee derniere/.test(n))return 'a connu le salon lors d’une édition précédente';
 if(/instagram|insta/.test(n))return 'a découvert le salon sur Instagram';
 if(/bouche a oreille|ami|amis|proche/.test(n))return 'a découvert le salon par bouche-à-oreille';
 if(/affiche|flyer/.test(n))return 'a découvert le salon grâce à la communication locale';
 return value?`a découvert le salon via ${value}`:'';
}
function textTheme(records,field,kind){
 const values=records.map(record=>answerFor(record.row,field)).filter(value=>typeof value==='string'&&value.trim());
 const group=groupComments(values,kind)[0];
 const quote=(group?.quotes?.[0]?.text||values[0]||'').replace(/[.!?]+$/,'');
 return {theme:group?.name||'',quote,count:group?.count||values.length,total:values.length};
}
function personaText(records,index){
 const gender=dominant(records,'gender'),community=dominant(records,'community'),age=dominant(records,'age'),companions=dominant(records,'companions'),purchase=dominant(records,'purchase'),returnIntent=dominant(records,'returnIntent'),duration=dominant(records,'duration'),discovery=dominant(records,'discovery'),spend=averageSpend(records);
 const name=profileName(gender?.value,index),exactAge=ageFromBucket(age?.value,index);
 const intro=[name,exactAge?`${exactAge} ans`:age?.value,community?`fan de ${community.value}`:'visiteur du salon'].filter(Boolean).join(', ');
 const details=[];
 if(companions)details.push(String(companions.value).toLowerCase().startsWith('venu')?companions.value:`venu ${companions.value.toLowerCase()}`);
 if(duration)details.push(`reste ${duration.value.toLowerCase()} sur place`);
 if(spend!==null)details.push(`avec un panier moyen estimé à ${spend} €`);
 if(purchase)details.push(`achète surtout ${phraseJoin(valuesForGroup(records,'purchase').slice(0,3)).toLowerCase()}`);
 if(discovery)details.push(discoveryPhrase(discovery.value));
 if(returnIntent)details.push(returnPhrase(returnIntent.value));
 const sentence=details.join(', ');
 return sentence?`${intro}. ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`:`${intro}.`;
}
function motivation(records){
 const positive=textTheme(records,'highlights','highlights');
 if(positive.quote)return positive.quote;
 const purchase=dominant(records,'purchase'),returnIntent=dominant(records,'returnIntent');
 if(purchase&&returnIntent)return `Trouver ${purchase.value.toLowerCase()} et profiter d’un événement qui donne envie de revenir.`;
 if(purchase)return `Trouver ${purchase.value.toLowerCase()} sur place.`;
 return 'Profiter du salon et rencontrer la communauté hobby.';
}
function frustration(records){
 const issue=textTheme(records,'improvements','improvements');
 return issue.quote||'Aucune frustration dominante ne ressort clairement dans ce groupe.';
}
function valuesForGroup(records,key){
 const {entries}=counts(records,key);
 return entries.map(([value])=>value);
}
function persona(group,index,scope='global'){const gender=dominant(group,'gender');return {id:`${scope}-${index+1}`,number:index+1,name:profileName(gender?.value,index),image:profileImage(gender?.value,index),count:group.length,facts:facts(group),summary:personaText(group,index),motivation:motivation(group),frustration:frustration(group)};}
export function generatePersonas(rows){
 const records=rows.filter(row=>['visiteur','vip','exposant'].includes(row.type)).map(row=>({row,values:responses(row)}));
 const communities=[...new Set(records.flatMap(record=>communityValues(record.row)))].sort((a,b)=>a.localeCompare(b,'fr'));
 return {total:records.length,global:segment(records,5).map((group,index)=>persona(group,index,'global')),communities:communities.map(name=>{
  const eligible=records.filter(record=>communityValues(record.row).includes(name));
  const scope='community-'+normalizeVerbatim(name).replace(/\s+/g,'-');
  return {name,total:eligible.length,profiles:segment(eligible,3).map((group,index)=>persona(group,index,scope))};
 })};
}

function profileCard(profile,{canEdit=false,overrides={},editing=''}){
 const summary=overrides[profile.id]??profile.summary;
 return `<article class="panel persona-card persona-card-visual" data-persona-id="${esc(profile.id)}"><div class="persona-hero"><img src="${esc(profile.image)}" alt="Illustration persona"><div><span>${profile.count} réponse${profile.count>1?'s':''} regroupée${profile.count>1?'s':''}</span><h3>${esc(profile.name)}</h3></div></div>${editing===profile.id?`<div class="persona-edit"><textarea rows="5" data-persona-draft="${esc(profile.id)}">${esc(summary)}</textarea><div class="actions"><button type="button" class="btn small" data-persona-cancel>Annuler</button><button type="button" class="btn small primary" data-persona-save="${esc(profile.id)}">Enregistrer</button></div></div>`:`<p class="persona-summary">${esc(summary)}</p>`}<div class="persona-insights"><div><strong>Motivation</strong><p>${esc(profile.motivation)}</p></div><div><strong>Frustration</strong><p>${esc(profile.frustration)}</p></div></div>${canEdit?`<div class="actions persona-actions"><button type="button" class="btn small" data-persona-edit="${esc(profile.id)}">Modifier</button><button type="button" class="btn small danger" data-persona-delete="${esc(profile.id)}">Supprimer</button></div>`:''}</article>`;
}
function cards(profiles,target,options){
 const visible=profiles.filter(profile=>!options.deleted?.has(profile.id));
 return `${visible.length?`<div class="persona-grid">${visible.map(profile=>profileCard(profile,options)).join('')}</div>`:'<p class="sub">Il faut au moins deux réponses comparables pour former un profil.</p>'}${visible.length<target?`<p class="sub">${visible.length}/${target} profils affichés. Les profils manquants ne sont pas inventés.</p>`:''}`;
}

export function personasMarkup(rows,generated=false,options={}){
 if(!generated)return `<section class="panel persona-intro"><h2>Personas issus des retours</h2><p>Génère jusqu’à 5 profils globaux et 3 profils par communauté, uniquement à partir des réponses de cette édition. Aucun comportement n’est ajouté sans réponse correspondante ; les prénoms servent seulement à rendre les profils plus lisibles.</p><button type="button" class="btn primary" data-survey-generate-personas>Générer les personas</button></section>`;
 const result=generatePersonas(rows),opts={canEdit:false,overrides:{},deleted:new Set(),editing:'',...options};
 return `<div class="persona-dashboard"><section class="panel persona-intro"><div class="panel-head"><div><h2>Personas issus des retours</h2><p class="sub">${result.total} réponse${result.total>1?'s':''} analysée${result.total>1?'s':''} · personas types composés à partir des tendances réelles.</p></div><button type="button" class="btn small" data-survey-generate-personas>Regénérer</button></div><p class="sub">Les personas regroupent les réponses communes de plusieurs visiteurs pour résumer les grands profils en 5 cartes. Tu peux modifier le texte ou supprimer une card affichée.</p></section><section class="persona-section"><h2>Vue globale <small>· ${result.global.filter(profile=>!opts.deleted.has(profile.id)).length}/5</small></h2>${cards(result.global,5,opts)}</section></div>`;
}
