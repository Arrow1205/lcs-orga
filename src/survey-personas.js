import {communityValues,answerFor,questionFor} from './visitor-feedback.js';
import {normalizeVerbatim} from './feedback-themes.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const typeNames={visiteur:'Visiteur',vip:'VIP / Early Access',exposant:'Exposant / partenaire'};
const known=[['returnIntent','Envie de revenir'],['age','Âge'],['gender','Genre'],['ticket','Type de visiteur'],['purchase','Achats'],['duration','Temps passé'],['discovery','Découverte du salon']];
const fallback=[['premiumType','Billet'],['participation','Participation'],['vendorType','Type d’exposant'],['zone','Zone'],['premiumValue','Valeur du billet']];
const excluded=/\b(nom|prenom|identite|societe|telephone|email|mail|contact|adresse)\b/;
const scalar=value=>typeof value==='string'&&value.trim()?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):null;

function responses(row){
 const values=new Map([['type',{label:'Formulaire',value:typeNames[row.type]||row.type,priority:0}]]);
 const communities=communityValues(row).filter(Boolean);
 if(communities.length)values.set('community',{label:'Communauté',value:communities.sort((a,b)=>a.localeCompare(b,'fr')).join(' · '),priority:1,multi:communities});
 for(const [index,[field,label]] of known.entries()){
  const value=scalar(answerFor(row,field));
  if(value)values.set(field,{label,value,priority:index+2});
 }
 for(const [index,[key,label]] of fallback.entries()){
  const value=scalar(row.answers?.[key]);
  if(value)values.set(key,{label,value,priority:index+known.length+2});
 }
 for(const question of row.questions||[]){
  if(!['choice','dropdown','checkbox','rating','rating10'].includes(question.kind)||excluded.test(normalizeVerbatim(question.label)))continue;
  if(known.some(([field])=>questionFor(row,field)?.key===question.key)||questionFor(row,'community')?.key===question.key)continue;
  const value=row.answers?.[question.key];
  const selected=Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()).sort((a,b)=>a.localeCompare(b,'fr')).join(' · '):scalar(value);
  if(!selected)continue;
  const label=String(question.label||question.key).trim();
  const id='q:'+normalizeVerbatim(label);
  if(!values.has(id))values.set(id,{label,value:selected,priority:100});
 }
 return values;
}

const rawValue=(record,key)=>record.values.get(key)?.value;
function splitCandidate(records){
 const keys=[...new Set(records.flatMap(record=>[...record.values.keys()]))];
 let best=null;
 for(const key of keys){
  if(records.some(record=>!rawValue(record,key)))continue;
  const counts=new Map();
  for(const record of records)for(const value of key==='community'?record.values.get(key).multi:[rawValue(record,key)])counts.set(value,(counts.get(value)||0)+1);
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
  const matches=item=>split.key==='community'?item.values.get('community').multi.includes(split.value):rawValue(item,split.key)===split.value;
  const left=group.filter(matches),right=group.filter(item=>!matches(item));
  groups.splice(index,1,left,right);
 }
 return groups.sort((a,b)=>b.length-a.length);
}

function facts(records){
 const keys=[...new Set(records.flatMap(record=>[...record.values.keys()]))];
 return keys.map(key=>{
  const answered=records.filter(item=>rawValue(item,key));
  if(answered.length<2)return null;
  const counts=new Map();for(const record of answered)for(const value of key==='community'?record.values.get(key).multi:[rawValue(record,key)])counts.set(value,(counts.get(value)||0)+1);
  const [value,count]=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'))[0];
  if(count<2||count/answered.length<=.5)return null;
  return {label:answered[0].values.get(key).label,value,count,answered:answered.length,priority:answered[0].values.get(key).priority};
 }).filter(Boolean).sort((a,b)=>a.priority-b.priority||b.count-a.count).slice(0,7);
}

export function generatePersonas(rows){
 const records=rows.filter(row=>['visiteur','vip','exposant'].includes(row.type)).map(row=>({row,values:responses(row)}));
 const communities=[...new Set(records.flatMap(record=>communityValues(record.row)))].sort((a,b)=>a.localeCompare(b,'fr'));
 const describe=(group,index)=>({number:index+1,count:group.length,facts:facts(group)});
 return {total:records.length,global:segment(records,5).map(describe),communities:communities.map(name=>{
  const eligible=records.filter(record=>communityValues(record.row).includes(name));
  return {name,total:eligible.length,profiles:segment(eligible,3).map(describe)};
 })};
}

function cards(profiles,target){
 return `${profiles.length?`<div class="persona-grid">${profiles.map(profile=>`<article class="panel persona-card"><div class="panel-head"><h3>Profil observé ${profile.number}</h3><strong>${profile.count} réponse${profile.count>1?'s':''}</strong></div><dl>${profile.facts.map(fact=>`<div><dt>${esc(fact.label)}</dt><dd>${esc(fact.value)} <small>${fact.count}/${fact.answered} réponses renseignées</small></dd></div>`).join('')}</dl></article>`).join('')}</div>`:'<p class="sub">Il faut au moins deux réponses comparables pour former un profil.</p>'}${profiles.length<target?`<p class="sub">${profiles.length}/${target} profils étayés par les réponses disponibles. Les profils manquants ne sont pas inventés.</p>`:''}`;
}

export function personasMarkup(rows,generated=false){
 if(!generated)return `<section class="panel persona-intro"><h2>Personas issus des retours</h2><p>Génère jusqu’à 5 profils globaux et 3 profils par communauté, uniquement à partir des réponses de cette édition. Aucun nom, âge, besoin ou comportement n’est ajouté sans réponse correspondante.</p><button type="button" class="btn primary" data-survey-generate-personas>Générer les personas</button></section>`;
 const result=generatePersonas(rows);
 return `<div class="persona-dashboard"><section class="panel persona-intro"><div class="panel-head"><div><h2>Personas issus des retours</h2><p class="sub">${result.total} réponse${result.total>1?'s':''} analysée${result.total>1?'s':''} · profils observés, sans informations inventées.</p></div><button type="button" class="btn small" data-survey-generate-personas>Regénérer</button></div><p class="sub">Chaque caractéristique indique le nombre de réponses qui la mentionnent. Les profils d’une même section ne se chevauchent pas ; une réponse peut figurer dans plusieurs communautés si plusieurs ont été choisies.</p></section><section class="persona-section"><h2>Vue globale <small>· ${result.global.length}/5</small></h2>${cards(result.global,5)}</section>${result.communities.map(community=>`<section class="persona-section"><h2>${esc(community.name)} <small>· ${community.profiles.length}/3 profils · ${community.total} réponses</small></h2>${cards(community.profiles,3)}</section>`).join('')||'<section class="panel"><p class="sub">Aucune communauté renseignée dans les réponses.</p></section>'}</div>`;
}
