import {groupComments} from './feedback-themes.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const qMap={status:1,zone:2,experience:3,location:4,spaceFit:5,spaceLimit:6,logistics:7,flow:8,crowding:9,buyingType:10,cardBudget:11,bestSellers:12,revenue:13,salesExpectations:14,value:15,organization:16,returnIntent:17,noReturnReason:18,nextConfig:19,bookingChoice:20,bookingType:21,tables:22,surface:23,budgetIncrease:24,improvement:25,keep:26,suggestion:27};
const fallback={experience:'satisfaction',returnIntent:'returnIntent',improvement:'improvements',keep:'highlights',status:'participation',zone:'zone',value:'value'};
const labels={status:'Statut',zone:'Zone',spaceFit:'Espace sélectionné',spaceLimit:'Produits non exposés par manque de place',flow:'Flux visiteurs',crowding:'Affluence trop forte',buyingType:'Type d’achat recherché',cardBudget:'Budget carte estimé',bestSellers:'Meilleures ventes',revenue:'Chiffre d’affaires',salesExpectations:'Ventes vs attentes',returnIntent:'Retour prochaine édition',noReturnReason:'Freins au retour',nextConfig:'Configuration souhaitée',bookingChoice:'Table ou m²',bookingType:'Type de réservation',tables:'Nombre de tables',surface:'Surface souhaitée',budgetIncrease:'Budget exposant'};
const pieColors=['#1303e3','#f38b35','#159d69','#c45ab6','#26a6c8','#dfb036','#7958d2','#d8585d','#697887'];
function questionFor(row,field,definitions=[]){
 const snapshot=row.questions||[],canonical=(definitions||[]).length?definitions:snapshot;
 const number=qMap[field],prefix=number?`q${number}_`:'';
 if(prefix){
  const exact=canonical.find(q=>String(q.key||'').startsWith(prefix))||snapshot.find(q=>String(q.key||'').startsWith(prefix));
  if(exact)return exact;
 }
 return canonical.find(q=>clean(q.label).includes(clean(labels[field]||field)))||snapshot.find(q=>clean(q.label).includes(clean(labels[field]||field)))||null;
}
function questionNumber(field,definitions=[]){
 const q=questionFor({questions:definitions,answers:{}},field,definitions);
 const index=q?definitions.findIndex(item=>item.key===q.key):-1;
 return index>=0?index+1:null;
}
function hasQuestion(field,definitions=[]){return !!questionFor({questions:definitions,answers:{}},field,definitions)}
function answerFor(row,field,definitions=[]){
 const q=questionFor(row,field,definitions),value=q?row.answers?.[q.key]:undefined;
 return value!==undefined?value:row.answers?.[fallback[field]];
}
function distribution(rows,field,definitions=[]){
 const counts=new Map();
 for(const row of rows){
  const raw=answerFor(row,field,definitions),values=Array.isArray(raw)?raw:[raw];
  for(const value of new Set(values)){const label=String(value??'').trim();if(label)counts.set(label,(counts.get(label)||0)+1)}
 }
 return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));
}
function averageRating(rows,field,definitions=[]){
 const values=rows.map(row=>{const q=questionFor(row,field,definitions),scale=q?.kind==='rating10'?10:5,n=Number(answerFor(row,field,definitions));return Number.isInteger(n)&&n>=0&&n<=scale?n*10/scale:null}).filter(v=>v!==null);
 return {average:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length};
}
function top(entries){return entries[0]?.[0]||null}
function moneyFromBucket(value){
 if(/prefere|difficile/i.test(String(value)))return null;
 const nums=[...String(value).replace(/\s/g,'').matchAll(/\d+/g)].map(x=>Number(x[0])).filter(Number.isFinite);
 if(!nums.length)return null;
 if(/plus|\+/.test(String(value)))return nums[0];
 return nums.length>=2?Math.round((nums[0]+nums[1])/2):nums[0];
}
function averageBucket(entries){
 const vals=entries.map(([label,count])=>[moneyFromBucket(label),count]).filter(([amount])=>amount!==null);
 const total=vals.reduce((sum,[amount,count])=>sum+amount*count,0),n=vals.reduce((sum,[,count])=>sum+count,0);
 return n?Math.round(total/n/10)*10:null;
}
function yesish(label){return /^oui/.test(clean(label))}
function gridStats(rows,field,definitions=[]){
 const snapshots=rows.map(r=>questionFor(r,field,definitions)).filter(Boolean),latest=snapshots[0];
 const gridRows=[...new Map([...(latest?.rows||[]),...snapshots.flatMap(q=>q.rows||[]),...rows.flatMap(r=>Object.keys(answerFor(r,field,definitions)||{}))].map(label=>[clean(label),label])).values()];
 const columns=[...new Map([...(latest?.columns||['1','2','3','4','5']),...snapshots.flatMap(q=>q.columns||[])].map(label=>[clean(label),label])).values()];
 return {columns,rows:gridRows.map(label=>{let total=0,sum=0;const counts=new Map(columns.map(c=>[clean(c),0]));for(const row of rows){const answer=answerFor(row,field,definitions);if(!answer||typeof answer!=='object')continue;const value=Object.entries(answer).find(([name])=>clean(name)===clean(label))?.[1];if(value){const key=clean(value);counts.set(key,(counts.get(key)||0)+1);const n=Number(value);if(Number.isFinite(n))sum+=n;total++}}return {label,total,average:total?sum/total:null,counts:columns.map(c=>({label:c,count:counts.get(clean(c))||0}))}})};
}
export function exhibitorStats(rows,definitions=[]){
 const exhibitors=rows.filter(r=>r.type==='exposant');
 const dist=Object.fromEntries(Object.keys(labels).map(field=>[field,distribution(exhibitors,field,definitions)]));
 const experience=averageRating(exhibitors,'experience',definitions),location=averageRating(exhibitors,'location',definitions),value=averageRating(exhibitors,'value',definitions);
 const returnPositive=dist.returnIntent.filter(([label])=>['oui certainement','oui probablement'].includes(clean(label))).reduce((sum,[,count])=>sum+count,0);
 const bookingInterest=dist.bookingChoice.filter(([label])=>yesish(label)).reduce((sum,[,count])=>sum+count,0);
 return {total:exhibitors.length,dist,experience,location,value,topSeller:top(dist.bestSellers),averageRevenue:averageBucket(dist.revenue),returnPositive,bookingInterest,logistics:gridStats(exhibitors,'logistics',definitions),organization:gridStats(exhibitors,'organization',definitions),rows:exhibitors};
}
function pieChart(title,entries,respondents,multiple=false){
 const total=entries.reduce((sum,[,count])=>sum+count,0);let angle=0;
 const stops=entries.map(([,count],i)=>{const start=angle;angle+=count/total*100;return `${pieColors[i%pieColors.length]} ${start}% ${angle}%`}).join(',');
 return `<section class="panel visitor-pie-panel"><div class="panel-head"><h2>${esc(title)}</h2><small>${total} ${multiple?'mentions':'réponses'}</small></div>${total?`<div class="visitor-pie-layout"><div class="visitor-pie" style="background:conic-gradient(${stops})"></div><ul class="visitor-pie-legend">${entries.map(([name,count],i)=>`<li><i style="background:${pieColors[i%pieColors.length]}"></i><span>${esc(name)}</span><strong>${count} <small>· ${Math.round(count/(multiple?respondents:total)*100)} %</small></strong></li>`).join('')}</ul></div>${multiple?'<p class="sub visitor-pie-note">Plusieurs choix possibles.</p>':''}`:'<p class="sub">Aucune réponse pour le moment.</p>'}</section>`;
}
function barChart(title,entries,total){return `<section class="panel visitor-chart"><div class="panel-head"><h2>${esc(title)}</h2></div>${entries.length?entries.map(([label,count])=>`<div class="visitor-bar-row"><span>${esc(label)}</span><div class="visitor-bar-track"><i style="width:${total?count/total*100:0}%"></i></div><strong>${count} <small>· ${total?Math.round(count/total*100):0} %</small></strong></div>`).join(''):'<p class="sub">Aucune réponse.</p>'}</section>`}
function gridPanel(title,grid){
 const palette=['#d8585d','#ed735c','#f2be3d','#73bd55','#16a86d','#1303e3'];
 return `<section class="panel visitor-grid-results"><div class="panel-head"><h2>${esc(title)}</h2><small>Moyenne par ligne</small></div>${grid.rows.length?`<div class="visitor-grid-legend">${grid.columns.map((c,i)=>`<span><i style="background:${palette[i%palette.length]}"></i>${esc(c)}</span>`).join('')}</div>${grid.rows.map(row=>`<div class="visitor-grid-result"><div class="visitor-grid-title"><strong>${esc(row.label)}</strong><small>${row.average===null?'—':row.average.toFixed(1).replace('.',',')+'/5'} · ${row.total} réponse(s)</small></div><div class="visitor-stacked">${row.counts.map((x,i)=>x.count?`<span title="${esc(x.label)} : ${x.count}" style="width:${x.count/row.total*100}%;background:${palette[i%palette.length]}"></span>`:'').join('')}</div><div class="visitor-grid-numbers">${row.counts.map((x,i)=>`<span style="--dot:${palette[i%palette.length]}">${x.count}</span>`).join('')}</div></div>`).join('')}`:'<p class="sub">Aucune notation pour le moment.</p>'}</section>`;
}
function trendItem(group){return `<details><summary><span>${esc(group.name)}</span><strong>${group.count}</strong></summary>${group.quotes.map(q=>`<blockquote>${esc(q.text)}${q.count>1?` <small>× ${q.count}</small>`:''}</blockquote>`).join('')}</details>`}
function trends(rows,field,title,definitions=[]){const values=rows.map(r=>answerFor(r,field,definitions)).filter(v=>typeof v==='string'&&v.trim()),groups=groupComments(values,field),first=groups.slice(0,5),rest=groups.slice(5);return `<section class="panel visitor-texts visitor-trends"><div class="panel-head"><h2>${esc(title)}</h2><small>${values.length} réponses</small></div>${groups.length?`<div class="visitor-trend-list">${first.map(trendItem).join('')}${rest.length?`<details class="visitor-more"><summary>Voir 5 de plus</summary><div class="visitor-trend-list">${rest.slice(0,5).map(trendItem).join('')}</div></details>`:''}</div>`:'<p class="sub">Aucun retour.</p>'}</section>`}
export function exhibitorFeedbackMarkup(rows,definitions=[]){
 const s=exhibitorStats(rows,definitions),n=s.total,fmt=v=>v===null?'—':v.toFixed(1).replace('.',',')+'/10';
 const q=field=>questionNumber(field,definitions),tag=field=>q(field)?`Q${q(field)} · `:'';
 const pie=(field,multiple=false)=>hasQuestion(field,definitions)?pieChart(labels[field],s.dist[field],n,multiple):'';
 const kpi=(field,label,value,note)=>hasQuestion(field,definitions)?`<div class="stat"><span class="k">${label}</span><strong>${value}</strong><small>${tag(field)}${note}</small></div>`:'';
 return `<div class="visitor-dashboard exhibitor-dashboard"><div class="visitor-kpis visitor-kpis-wide"><div class="stat"><span class="k">Réponses exposants</span><strong>${n}</strong></div>${kpi('experience','Expérience globale',fmt(s.experience.average),s.experience.count+' note(s)')}${kpi('location','Emplacement',fmt(s.location.average),s.location.count+' note(s)')}${kpi('value','Rapport qualité/prix',fmt(s.value.average),s.value.count+' note(s)')}${kpi('bestSellers','Meilleure vente',esc(s.topSeller||'—'),'choix le plus cité')}${kpi('revenue','CA moyen estimé',s.averageRevenue===null?'—':s.averageRevenue+' €','depuis les tranches')}${kpi('returnIntent','Revenir exposer',n?Math.round(s.returnPositive/n*100)+' %':'—','oui certainement/probablement')}${kpi('bookingChoice','Intérêt table / m²',n?Math.round(s.bookingInterest/n*100)+' %':'—','oui')}</div>
 <div class="visitor-bento">${pie('status')}${pie('zone')}${pie('spaceFit')}${pie('spaceLimit')}${pie('flow')}${pie('crowding')}${pie('buyingType')}${pie('cardBudget')}${pie('bestSellers',true)}${pie('revenue')}${pie('salesExpectations')}${pie('returnIntent')}${pie('noReturnReason',true)}${pie('nextConfig',true)}${pie('bookingChoice')}${pie('bookingType')}${pie('tables')}${pie('surface')}${pie('budgetIncrease')}</div>
 <div class="visitor-bento">${hasQuestion('logistics',definitions)?gridPanel(tag('logistics')+'Logistique pure',s.logistics):''}${hasQuestion('organization',definitions)?gridPanel(tag('organization')+'Organisation exposant',s.organization):''}</div>
 <div class="visitor-bento">${hasQuestion('buyingType',definitions)?barChart(tag('buyingType')+'Type d’achat recherché',s.dist.buyingType,n):''}${hasQuestion('bestSellers',definitions)?barChart(tag('bestSellers')+'Produits les mieux vendus',s.dist.bestSellers,n):''}</div>
 <div class="visitor-bento">${hasQuestion('improvement',definitions)?trends(s.rows,'improvement',tag('improvement')+'À améliorer',definitions):''}${hasQuestion('keep',definitions)?trends(s.rows,'keep',tag('keep')+'À conserver',definitions):''}${hasQuestion('suggestion',definitions)?trends(s.rows,'suggestion',tag('suggestion')+'Suggestions complémentaires',definitions):''}</div></div>`;
}
