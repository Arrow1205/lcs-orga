import {surveyAnswer,surveyQuestion,summaryMarkup} from './survey-analytics.js';
import {communityValues} from './visitor-feedback.js';
import {bucketAmount} from './feedback-metrics.js';
import {activeQuestions} from './survey-schema.js';
import {projectedAverage,projectedDistribution,projectedMetrics,projectedTotal} from './survey-simulation.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#1303e3','#fe4f14','#159d69','#d4aa13','#26a6c8','#b35aba','#7958d2','#d8585d','#697887'];
export const matchesSummaryType=(row,type='visiteurs')=>type==='exposants'?row.type==='exposant':['visiteur','vip'].includes(row.type);
const fmt=(n,digits=1)=>n.toLocaleString('fr-FR',{maximumFractionDigits:digits});
// Closed ranges use their midpoint. Open ages use the boundary (18-/65+).
export function summaryRange(value,{age=false,years=false,surface=false}={}){
 if(value===null||value===undefined||value==='')return null;
 const text=String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/m[²2]/g,'').trim();
 if(/ne sais|prefere|difficile|pas de reponse|non concerne/.test(text)||/^\s*-\d/.test(text))return null;
 if(age&&/moins/.test(text)){const n=Number(text.match(/\d+/)?.[0]);return n>0?n:null}
 const n=bucketAmount(text);if(n===null||n<0)return null;
 const result=years&&/mois/.test(text)?n/12:n;
 return age&&result>120||surface&&result>100000?null:result;
}
function values(raw){return [...new Set((Array.isArray(raw)?raw:[raw]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==''&&typeof v!=='object').map(String))]}
export function summaryMetrics(allRows,type='visiteurs',forms={}){
 const rows=allRows.filter(r=>matchesSummaryType(r,type)),answer=(r,field)=>{const q=surveyQuestion(r,field,forms);if(q?.showIf&&!activeQuestions(r.type,r.answers||{},[q]).length)return undefined;return surveyAnswer(r,field,forms)},metrics=projectedMetrics(rows,forms);
 const dist=field=>projectedDistribution(rows,r=>answer(r,field));
 const numeric=(field,options)=>projectedAverage(rows,r=>summaryRange(answer(r,field),options));
 const communities=projectedDistribution(rows,r=>communityValues(r,forms[r.type]?.questions||[]));
 const purchases=projectedDistribution(rows,r=>values(answer(r,'purchase')).filter(v=>!/^oui$|^non$/i.test(v.trim())));
 const score=metrics.score;
 return {rows,total:projectedTotal(rows),score,spend:metrics.spend,returning:metrics.returning,entry:numeric('paidEntryPrice'),age:numeric('age',{age:true}),collection:dist('collectionAge'),collectionYears:numeric('collectionAge',{years:true}),communities,purchases,zones:dist('zone'),sales:dist('bestSellers'),revenue:numeric('revenue'),booking:dist('bookingType'),surface:numeric('surface',{surface:true}),rawResponses:rows.length};
}
function pie(title,distribution,{multiple=false,simulated=false}={}){
 const total=distribution.entries.reduce((n,[,count])=>n+count,0);let position=0;
 const slices=distribution.entries.map(([label,count],i)=>{const start=position;position+=count/total*100;return {label,count,percent:count/total*100,color:colors[i%colors.length],stop:`${colors[i%colors.length]} ${start}% ${position}%`}});
 return `<section class="panel summary-chart"><h2>${esc(title)}</h2>${total?`<div class="summary-pie-layout"><div class="summary-pie" role="img" aria-label="${esc(title+': '+slices.map(x=>x.label+' '+fmt(x.percent)+' %').join(', '))}" style="background:conic-gradient(${slices.map(x=>x.stop).join(',')})"></div><ul class="summary-pie-legend">${slices.map(x=>`<li><i style="background:${x.color}"></i><span>${esc(x.label)}</span><strong>${fmt(x.percent)} %</strong></li>`).join('')}</ul></div><p class="sub">${simulated?'≈ ':''}${fmt(distribution.answered)} ${simulated?'personnes représentées':'réponses exploitables'}.${multiple?' Plusieurs choix possibles : pourcentages calculés sur les sélections, total 100 %.':' Pourcentages parmi les réponses renseignées.'}</p>`:'<p class="sub">Aucune réponse exploitable · non estimable.</p>'}</section>`;
}
function bars(title,distribution,simulated=false){return `<section class="panel summary-chart"><h2>${esc(title)}</h2>${distribution.entries.length?distribution.entries.map(([label,count])=>`<div class="visitor-bar-row"><span>${esc(label)}</span><div class="visitor-bar-track"><i style="width:${count/distribution.answered*100}%"></i></div><strong>${fmt(count/distribution.answered*100)} %</strong></div>`).join(''):'<p class="sub">Aucune réponse exploitable.</p>'}<p class="sub">${simulated?'≈ ':''}${fmt(distribution.answered)} ${simulated?'personnes représentées':'réponses exploitables'}.</p></section>`}
export function summaryDashboard(allRows,type,forms={},generated=false,{simulated=false}={}){
 const m=summaryMetrics(allRows,type,forms),seller=type==='exposants';
 const avg=(stat,suffix)=>stat.average===null?'—':fmt(stat.average)+suffix;
 const basis=stat=>`${simulated?'≈ ':''}${fmt(stat.answered)} ${simulated?'personnes représentées':'réponses exploitables'}`;
 const card=(key,label,value,hint='')=>`<div class="stat" data-summary-kpi="${key}"><span class="k">${label}</span><strong>${esc(value)}</strong>${hint?`<small>${esc(hint)}</small>`:''}</div>`;
 let cards=card('responses','Réponses',String(m.rawResponses),simulated?`Effectif simulé : ${m.total?'≈ '+fmt(m.total):'Non estimable'}`:seller?'Exposants et partenaires uniquement':'Visiteurs + VIP + Early Access');
 if(seller){cards+=card('zone','Zone principale',m.zones.entries[0]?.[0]||'—')+card('revenue','Chiffre d’affaires moyen',avg(m.revenue,' €'),basis(m.revenue)+' · estimation par tranches')+card('surface','Surface souhaitée moyenne',avg(m.surface,' m²'),basis(m.surface)+' · estimation par tranches');}
 else {cards+=card('satisfaction','Satisfaction globale',avg(m.score,'/10'),basis(m.score))+card('spend','Panier moyen',avg(m.spend,' €'),basis(m.spend)+' · estimation par tranches')+card('entry','Prix prêt à payer · entrée prochaine édition',avg(m.entry,' €'),basis(m.entry)+' · montants déclarés')+card('purchase','Achat principal',m.purchases.entries[0]?.[0]||'—',m.purchases.entries.length?`${fmt(m.purchases.entries[0][1]/m.purchases.answered*100)} % des répondants à cette question`:'Aucun type d’achat renseigné')+card('age','Âge moyen estimé',avg(m.age,' ans'),basis(m.age))+card('collection','Ancienneté moyenne de collection',avg(m.collectionYears,' ans'),basis(m.collectionYears)+' · estimation par tranches')+card('return','Envie de revenir',m.returning.percent===null?'—':m.returning.percent+' %','Oui / (Oui + Non) · indécis exclus');}
 const charts=seller?bars('Zones des exposants',m.zones,simulated)+pie('Meilleures ventes · type de vente',m.sales,{multiple:true,simulated})+pie('Type de réservation',m.booking,{simulated}):pie('Communautés',m.communities,{multiple:true,simulated})+bars('Depuis quand sont-ils collectionneurs ?',m.collection,simulated);
 return `<div class="summary-dashboard" data-summary-type="${seller?'exposants':'visiteurs'}"><h2>${seller?'Exposants / partenaires':'Visiteurs · VIP · Early Access'}</h2><div class="cards survey-kpis">${cards}</div><div class="survey-feedback-grid">${charts}</div><p class="sub">${seller?'CA et surfaces : centres des tranches ; bornes utilisées pour les tranches « plus de ». Les absences de réponse sont exclues.':'Âge et ancienneté : centres des tranches ; bornes utilisées pour les âges ouverts (moins de 18 ans = 18 ; 65 ans et plus = 65). Pour une ancienneté « moins de », la moitié de la borne est utilisée. Les mois sont convertis en années. Les montants et moyennes sont calculés uniquement sur les réponses exploitables.'}</p>${simulated?'<p class="sub">KPI pondérés selon les coefficients 2026 ; la synthèse et les verbatims ci-dessous décrivent uniquement les réponses réelles de ce public.</p>':''}${summaryMarkup(m.rows,forms,generated)}</div>`;
}
