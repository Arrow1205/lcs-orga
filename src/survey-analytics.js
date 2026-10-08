import {answerFor,questionFor,communityValues} from './visitor-feedback.js';
import {exhibitorAnswerFor,exhibitorQuestionFor} from './exhibitor-feedback.js';
import {returnCounts,meanBuckets} from './feedback-metrics.js';
import {normalizeVerbatim,groupComments} from './feedback-themes.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mapping={satisfaction:'experience',highlights:'keep',improvements:'improvement',community:'zone'};
export function surveyAnswer(row,field,forms={}){
 const defs=row.questions?.length?row.questions:forms[row.type]?.questions||[];
 return row.type==='exposant'?exhibitorAnswerFor(row,mapping[field]||field,defs):answerFor(row,field,defs);
}
export function surveyQuestion(row,field,forms={}){
 const defs=row.questions?.length?row.questions:forms[row.type]?.questions||[];
 return row.type==='exposant'?exhibitorQuestionFor(row,mapping[field]||field,defs):questionFor(row,field,defs);
}
export function sellerType(row,forms={}){
 if(row.type!=='exposant')return null;
 const statuses=[surveyAnswer(row,'status',forms),row.answers?.participation,row.answers?.vendorType].map(normalizeVerbatim);
 if(statuses.some(n=>/partenaire/.test(n)))return 'Partenaire';
 for(const n of statuses){if(/professionnel|^pro$/.test(n))return 'Professionnel';if(/particulier|collectionneur/.test(n))return 'Particulier'}return null;
}
export function frequency(values){const counts=new Map();for(const value of values){for(const v of new Set(Array.isArray(value)?value:[value]))if(typeof v==='string'&&v.trim())counts.set(v.trim(),(counts.get(v.trim())||0)+1)}return [...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));}
export function purchaseSpend(rows,forms={}){return meanBuckets(rows.filter(r=>['visiteur','vip'].includes(r.type)).map(r=>surveyAnswer(r,'spend',forms)));}
export function returningStats(rows,forms={}){return returnCounts(rows.map(r=>surveyAnswer(r,'returnIntent',forms)));}
export function comparisonStats(rows,forms={}){
 const sellers=rows.filter(r=>r.type==='exposant'),buyers=rows.filter(r=>['visiteur','vip'].includes(r.type));
 return {sellerTypes:frequency(sellers.map(r=>sellerType(r,forms))),sellerAnswered:sellers.filter(r=>sellerType(r,forms)).length,purchases:frequency(buyers.map(r=>surveyAnswer(r,'purchase',forms))),purchaseAnswered:buyers.filter(r=>{const v=surveyAnswer(r,'purchase',forms);return Array.isArray(v)?v.length:typeof v==='string'&&v.trim()}).length,bestSellers:frequency(sellers.map(r=>surveyAnswer(r,'bestSellers',forms))),sellerProducts:['Particulier','Professionnel','Partenaire'].map(type=>({type,entries:frequency(sellers.filter(r=>sellerType(r,forms)===type).map(r=>surveyAnswer(r,'bestSellers',forms)))})).filter(g=>g.entries.length)};
}
export function comparisonMarkup(rows,forms={}){
 const s=comparisonStats(rows,forms),table=(title,entries,n)=>`<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2><small>${n} répondant(s)</small></div>${entries.length?`<div class="table-scroll"><table><thead><tr><th>Type</th><th>Réponses</th><th>Part</th></tr></thead><tbody>${entries.map(([label,count])=>`<tr><td>${esc(label)}</td><td>${count}</td><td>${Math.round(count/n*100)} %</td></tr>`).join('')}</tbody></table></div>`:'<p class="sub">Aucune réponse exploitable.</p>'}</section>`;
 const bySeller=s.sellerProducts.length?`<section class="panel"><h2>Produits vendus par type de vendeur</h2><div class="table-scroll"><table><thead><tr><th>Type de vendeur</th><th>Meilleures ventes déclarées</th><th>Réponses</th></tr></thead><tbody>${s.sellerProducts.flatMap(g=>g.entries.map(([product,count])=>`<tr><td>${esc(g.type)}</td><td>${esc(product)}</td><td>${count}</td></tr>`)).join('')}</tbody></table></div></section>`:'';
 return `<div class="visitor-bento">${table('Types de vendeurs',s.sellerTypes,s.sellerAnswered)}${table('Types d’achat · visiteurs et VIP',s.purchases,s.purchaseAnswered)}${s.bestSellers.length?table('Produits vendus · exposants',s.bestSellers,rows.filter(r=>r.type==='exposant'&&surveyAnswer(r,'bestSellers',forms)?.length).length):''}</div>${bySeller}<p class="sub">Répartitions des vendeurs et des achats déclarés ; les réponses anonymes ne permettent pas de relier un achat à un vendeur. Plusieurs choix possibles pour les produits.</p>`;
}
export function summaryEvidence(rows,forms={}){
 const comments=[];
 for(const [index,row] of rows.entries())for(const field of ['highlights','improvements','suggestion']){
  const value=surveyAnswer(row,field,forms);if(typeof value==='string'&&value.trim())comments.push({id:`r${index+1}-${field}`,type:row.type,field,text:value.trim()});
 }
 const groups=groupComments(comments.filter(c=>c.field==='highlights').map(c=>c.text),'highlights');
 const issueGroups=groupComments(comments.filter(c=>c.field==='improvements').map(c=>c.text),'improvements');
 const people=rows.filter(r=>['visiteur','vip'].includes(r.type)),exhibitors=rows.filter(r=>r.type==='exposant');
 const n=key=>comments.filter(c=>key.test(normalizeVerbatim(c.text)));
 const tableScores=exhibitors.map(r=>{const v=surveyAnswer(r,'location',forms);return typeof v==='number'&&v>=0&&v<=10?v:null}).filter(v=>v!==null);
 return {total:rows.length,visitorCount:people.length,sellerCount:exhibitors.length,returning:returningStats(rows,forms),spend:purchaseSpend(rows,forms),positiveGroups:groups,issueGroups,ambiance:n(/ambiance|convivial|atmosphere|rencontre|communaute/),crowding:n(/affluence|foule|trop de monde|allees|circul|bonde|manque de place/),tables:n(/table|emplacement|stand|espace|installation|stockage/),tableAverage:tableScores.length?tableScores.reduce((a,b)=>a+b,0)/tableScores.length:null,tableRated:tableScores.length,space:frequency(exhibitors.map(r=>surveyAnswer(r,'spaceFit',forms))),spaceLimit:frequency(exhibitors.map(r=>surveyAnswer(r,'spaceLimit',forms))),comments,comparison:comparisonStats(rows,forms)};
}
export function generateSummary(rows,forms={}){
 const e=summaryEvidence(rows,forms),theme=(groups)=>groups.slice(0,3).map(g=>`${g.name} (${g.count} mentions)`).join(', '),distinct=items=>new Set(items.map(c=>c.id.split('-')[0])).size;
 const ambiance=e.ambiance.length?`${distinct(e.ambiance)} répondant(s) évoquent l’ambiance, la convivialité ou les rencontres. Points positifs les plus cités : ${theme(e.positiveGroups)||'aucun thème suffisamment renseigné'}.`:'L’ambiance est trop peu commentée pour dégager une tendance spécifique.';
 const crowd=e.crowding.length?`${distinct(e.crowding)} répondant(s) signalent ou commentent l’affluence et la circulation. Les retours demandent une lecture des allées et des zones les plus contraintes ; ils ne constituent pas un comptage de fréquentation.`:'Les réponses ne permettent pas de conclure sur l’affluence ou la circulation.';
 const space=e.space.filter(([label])=>/trop petit/.test(normalizeVerbatim(label))).reduce((a,[,n])=>a+n,0);
 const tables=`${e.tableRated?`Emplacement moyen : ${e.tableAverage.toFixed(1).replace('.',',')}/10 sur ${e.tableRated} notes. `:''}${space?`${space} exposant(s) jugent leur espace trop petit. `:''}${e.tables.length?`${distinct(e.tables)} répondant(s) commentent les tables, les stands ou leur positionnement.`:'Pas assez de retours spécifiques aux tables pour conclure.'}`;
 const spend=e.spend.average===null?'Aucun montant exploitable pour estimer le panier moyen.':`Panier moyen estimé : ${e.spend.average} € sur ${e.spend.count} réponses de visiteurs et VIP. Estimation à partir des centres des tranches ; les tranches ouvertes utilisent une convention, ce n’est pas un chiffre d’affaires mesuré. Achats les plus déclarés : ${e.comparison.purchases.slice(0,3).map(([label,n])=>`${label} (${n})`).join(', ')||'non renseignés'}.`;
 return {evidence:e,sections:[{id:'ambiance',title:'#1 · L’ambiance',text:ambiance,quotes:e.ambiance.slice(0,3)},{id:'affluence',title:'#2 · L’affluence',text:crowd,quotes:e.crowding.slice(0,3)},{id:'tables',title:'#3 · Les tables et emplacements',text:tables,quotes:e.tables.slice(0,3)},{id:'panier',title:'#4 · Le panier moyen',text:spend,quotes:[]}]};
}
export function summaryMarkup(rows,forms={},generated=false){
 return `<section class="panel"><div class="panel-head"><h2>Synthèse des retours</h2><button type="button" class="btn primary" data-survey-generate-summary>${generated?'Regénérer la synthèse':'Générer synthèse'}</button></div>${generated?`<div class="visitor-bento">${generateSummary(rows,forms).sections.map(s=>`<section><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.quotes.length?`<details><summary>Voir les retours sources</summary>${s.quotes.map(q=>`<blockquote>${esc(q.text)}</blockquote>`).join('')}</details>`:''}</section>`).join('')}</div>`:'<p class="sub">Ambiance, affluence, tables et panier moyen, à partir des réponses de la vue actuelle.</p>'}</section>`;
}
