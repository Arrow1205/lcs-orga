import {communityValues,answerFor,questionFor} from './visitor-feedback.js';
import {normalizeVerbatim,groupComments} from './feedback-themes.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeNames={visiteur:'Visiteur',vip:'VIP / Early Access',exposant:'Exposant / partenaire'};
const known=[['returnIntent','Envie de revenir'],['age','Âge'],['gender','Genre'],['ticket','Type de visiteur'],['purchase','Achats'],['duration','Temps passé'],['discovery','Découverte du salon'],['spend','Panier moyen'],['companions','Contexte de venue']];
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
  return fact;
 }).filter(Boolean).sort((a,b)=>a.priority-b.priority||b.count-a.count).slice(0,7);
}
function moneyValue(value){
 const match=String(value??'').replace(/,/g,'.').match(/\d+(?:\.\d+)?/);
 return match?Number(match[0]):null;
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
const names=['Alex','Géraldine','Samir','Camille','Nora','Julien','Inès','Thomas','Lina','Mehdi','Laura','Maxime'];
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
function narrative(records,index){
 const community=dominant(records,'community'),age=dominant(records,'age'),companions=dominant(records,'companions'),purchase=dominant(records,'purchase'),returnIntent=dominant(records,'returnIntent'),ticket=dominant(records,'ticket'),spend=averageSpend(records),issue=friction(records);
 const parts=[];
 const name=names[index%names.length];
 let intro=`${name}`;
 if(age)intro+=` · ${age.value}`;
 if(community)intro+=` · passionné de ${community.value}`;
 parts.push(intro);
 const details=[];
 if(companions)details.push(String(companions.value).toLowerCase().startsWith('venu')?companions.value:`venu ${companions.value.toLowerCase()}`);
 else if(ticket)details.push(ticket.value);
 if(spend!==null)details.push(`panier moyen ${spend} €`);
 if(purchase)details.push(`achète ${phraseJoin(valuesForGroup(records,'purchase').slice(0,3)).toLowerCase()}`);
 if(returnIntent)details.push(returnPhrase(returnIntent.value));
 if(details.length)parts.push(details.join(', '));
 if(issue?.quote)parts.push(`malgré « ${issue.quote} »`);
 return parts.join(', ')+'.';
}
function valuesForGroup(records,key){
 const {entries}=counts(records,key);
 return entries.map(([value])=>value);
}
function persona(group,index){return {number:index+1,name:names[index%names.length],count:group.length,facts:facts(group),summary:narrative(group,index),friction:friction(group)};}
export function generatePersonas(rows){
 const records=rows.filter(row=>['visiteur','vip','exposant'].includes(row.type)).map(row=>({row,values:responses(row)}));
 const communities=[...new Set(records.flatMap(record=>communityValues(record.row)))].sort((a,b)=>a.localeCompare(b,'fr'));
 return {total:records.length,global:segment(records,5).map(persona),communities:communities.map(name=>{
  const eligible=records.filter(record=>communityValues(record.row).includes(name));
  return {name,total:eligible.length,profiles:segment(eligible,3).map(persona)};
 })};
}

function cards(profiles,target){
 return `${profiles.length?`<div class="persona-grid">${profiles.map(profile=>`<article class="panel persona-card"><div class="panel-head"><h3>${esc(profile.name)}</h3><strong>${profile.count} réponse${profile.count>1?'s':''}</strong></div><p class="persona-summary">${esc(profile.summary)}</p><dl>${profile.facts.map(fact=>`<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)} <small>${fact.count}/${fact.answered} réponses renseignées</small></dd></div>`).join('')}${profile.friction?`<div><dt>Friction principale</dt><dd>${esc(profile.friction.theme)} <small>${profile.friction.count}/${profile.friction.total} retours libres</small></dd></div>`:''}</dl></article>`).join('')}</div>`:'<p class="sub">Il faut au moins deux réponses comparables pour former un profil.</p>'}${profiles.length<target?`<p class="sub">${profiles.length}/${target} profils étayés par les réponses disponibles. Les profils manquants ne sont pas inventés.</p>`:''}`;
}

export function personasMarkup(rows,generated=false){
 if(!generated)return `<section class="panel persona-intro"><h2>Personas issus des retours</h2><p>Génère jusqu’à 5 profils globaux et 3 profils par communauté, uniquement à partir des réponses de cette édition. Aucun comportement n’est ajouté sans réponse correspondante ; les prénoms servent seulement à rendre les profils plus lisibles.</p><button type="button" class="btn primary" data-survey-generate-personas>Générer les personas</button></section>`;
 const result=generatePersonas(rows);
 return `<div class="persona-dashboard"><section class="panel persona-intro"><div class="panel-head"><div><h2>Personas issus des retours</h2><p class="sub">${result.total} réponse${result.total>1?'s':''} analysée${result.total>1?'s':''} · personas types composés à partir des tendances réelles.</p></div><button type="button" class="btn small" data-survey-generate-personas>Regénérer</button></div><p class="sub">Les phrases résument les tendances dominantes de chaque groupe. Les données détaillées sous la phrase indiquent combien de réponses soutiennent chaque caractéristique.</p></section><section class="persona-section"><h2>Vue globale <small>· ${result.global.length}/5</small></h2>${cards(result.global,5)}</section>${result.communities.map(community=>`<section class="persona-section"><h2>${esc(community.name)} <small>· ${community.profiles.length}/3 profils · ${community.total} réponses</small></h2>${cards(community.profiles,3)}</section>`).join('')||'<section class="panel"><p class="sub">Aucune communauté renseignée dans les réponses.</p></section>'}</div>`;
}
