import {visitorFeedbackMarkup} from './visitor-feedback.js';
import {activeQuestions} from './survey-schema.js';
import {vipQuestions} from './vip-schema.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function questionFor(row,key,definitions){return (row.questions||[]).find(q=>q.key===key)||definitions.find(q=>q.key===key)}
function eligibleAnswer(row,key,definitions){
 const q=questionFor(row,key,definitions);
 if(!q||!activeQuestions('vip',row.answers||{},[q]).length)return undefined;
 return row.answers?.[key];
}
export function vipStats(rows,definitions=[]){
 const vipRows=rows.filter(r=>r.type==='vip');
 const bags=vipRows.map(r=>eligibleAnswer(r,'vip_bag',definitions)).filter(v=>Number.isInteger(v)&&v>=0&&v<=10);
 const distributions=Object.fromEntries(['vip_ticket','vip_price','vip_duration','vip_community_pack'].map(key=>{
  const counts=new Map();
  for(const row of vipRows){const value=eligibleAnswer(row,key,definitions);if(typeof value==='string'&&value.trim())counts.set(value,(counts.get(value)||0)+1)}
  const q=definitions.find(q=>q.key===key)||vipQuestions.find(q=>q.key===key);
  return [key,[...(q?.options||[]),...counts.keys()].filter((v,i,a)=>a.indexOf(v)===i).filter(v=>counts.has(v)).map(v=>[v,counts.get(v)])];
 }));
 const ratio=(key,value)=>{const entries=distributions[key],total=entries.reduce((sum,[,n])=>sum+n,0);return total?Math.round((entries.find(([v])=>v===value)?.[1]||0)/total*100):null};
 return {total:vipRows.length,bagCount:bags.length,bagAverage:bags.length?bags.reduce((a,b)=>a+b,0)/bags.length:null,distributions,goodValue:ratio('vip_price','Bon rapport qualité/prix'),packInterest:ratio('vip_community_pack','Oui')};
}
export function vipFeedbackMarkup(rows,definitions=[]){
 const s=vipStats(rows,definitions),pct=value=>value===null?'—':value+' %';
 const current=definitions.length?definitions:rows.find(r=>r.type==='vip'&&r.questions?.length)?.questions||[];
 const tag=key=>{const index=current.findIndex(q=>q.key===key);return index>=0?`Q${index+1} · `:''};
 const kpi=(key,label,value,note)=>`<div class="stat"><span class="k">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(tag(key)+note)}</small></div>`;
 const chart=key=>{
  const q=current.find(q=>q.key===key)||vipQuestions.find(q=>q.key===key),entries=s.distributions[key],total=entries.reduce((sum,[,n])=>sum+n,0);
  return `<section class="panel visitor-chart"><div class="panel-head"><h2>${esc(tag(key)+q.label)}</h2><small>${total} réponse(s)</small></div>${entries.length?entries.map(([label,count])=>`<div class="visitor-bar-row"><span>${esc(label)}</span><div class="visitor-bar-track"><i style="width:${count/total*100}%"></i></div><strong>${count} <small>· ${Math.round(count/total*100)} %</small></strong></div>`).join(''):'<p class="sub">Aucune réponse pour le moment.</p>'}</section>`;
 };
 const premium=`<div class="visitor-dashboard vip-dashboard"><div class="visitor-kpis">${kpi('vip_bag','Qualité du sac VIP',s.bagAverage===null?'—':s.bagAverage.toFixed(1).replace('.',',')+'/10',s.bagCount+' note(s) · VIP uniquement')}${kpi('vip_price','Bon rapport qualité/prix',pct(s.goodValue),'parmi les réponses à cette question')}${kpi('vip_community_pack','Intérêt pour un pack par communauté',pct(s.packInterest),'parmi les réponses à cette question')}</div><div class="visitor-bento">${['vip_ticket','vip_price','vip_duration','vip_community_pack'].map(chart).join('')}</div></div>`;
 return premium+visitorFeedbackMarkup(rows,current,{type:'vip'});
}
