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
 return {sellerTypes:frequency(sellers.map(r=>sellerType(r,forms))),sellerAnswered:sellers.filter(r=>sellerType(r,forms)).length,purchases:frequency(buyers.map(r=>surveyAnswer(r,'purchase',forms))),purchaseAnswered:buyers.filter(r=>{const v=surveyAnswer(r,'purchase',forms);return Array.isArray(v)?v.length:typeof v==='string'&&v.trim()}).length,bestSellers:frequency(sellers.map(r=>surveyAnswer(r,'bestSellers',forms)))};
}
export function productCategory(value){
 const n=normalizeVerbatim(value);
 if(/grad|graded|slab/.test(n))return 'Cartes gradées';
 if(/single|unite|unitaire/.test(n))return 'Cartes à l’unité';
 if(/box|display|boite/.test(n))return 'Boxes / Displays';
 if(/booster|pack/.test(n))return 'Boosters / Packs';
 if(/sets?|lots?/.test(n))return 'Sets / Lots';
 if(/derive|accessoire|goodies/.test(n))return 'Produits dérivés / accessoires';
 if(n==='autre'||n==='autres')return 'Autres produits';
 return String(value||'').trim();
}
export function productComparison(rows,forms={}){
 const series=(types,field)=>{
  const respondents=rows.filter(r=>types.includes(r.type)),counts=new Map(),available=new Set();let answered=0;
  const choices=value=>(Array.isArray(value)?value:[value]).filter(v=>typeof v==='string'&&v.trim());
  for(const type of types)for(const option of surveyQuestion({type,questions:forms[type]?.questions||[]},field,forms)?.options||[])available.add(productCategory(option));
  for(const row of respondents){
   for(const option of surveyQuestion(row,field,forms)?.options||[])available.add(productCategory(option));
   const values=choices(surveyAnswer(row,field,forms));if(!values.length)continue;answered++;
   for(const category of new Set(values.map(productCategory))){available.add(category);counts.set(category,(counts.get(category)||0)+1)}
  }return {answered,counts,available};
 };
 const buyers=series(['visiteur','vip'],'purchase'),sellers=series(['exposant'],'bestSellers');
 const categories=[...new Set([...buyers.available,...sellers.available])].sort((a,b)=>((buyers.counts.get(b)||0)+(sellers.counts.get(b)||0))-((buyers.counts.get(a)||0)+(sellers.counts.get(a)||0))||a.localeCompare(b,'fr'));
 return {buyerAnswered:buyers.answered,sellerAnswered:sellers.answered,products:categories.map(label=>({label,buyerCount:buyers.counts.get(label)||0,sellerCount:sellers.counts.get(label)||0,buyerPercent:buyers.answered&&buyers.available.has(label)?Math.round((buyers.counts.get(label)||0)/buyers.answered*100):null,sellerPercent:sellers.answered&&sellers.available.has(label)?Math.round((sellers.counts.get(label)||0)/sellers.answered*100):null}))};
}
export function comparisonMarkup(rows,forms={}){
 const s=comparisonStats(rows,forms),chart=productComparison(rows,forms);
 const bar=(label,percent,count,total,series)=>`<div class="product-compare-bar ${series}" aria-label="${esc(label)} : ${percent===null?'non disponible':percent+' %, '+count+' sur '+total+' répondants'}"><div class="product-compare-track"><i style="width:${percent??0}%"></i></div><strong>${percent===null?'—':percent+' %'}</strong></div>`;
 return `<section class="panel"><div class="panel-head"><h2>Types de vendeurs</h2><small>${s.sellerAnswered} répondant(s)</small></div>${s.sellerTypes.length?`<div class="table-scroll"><table><thead><tr><th>Type</th><th>Réponses</th><th>Part</th></tr></thead><tbody>${s.sellerTypes.map(([label,count])=>`<tr><td>${esc(label)}</td><td>${count}</td><td>${Math.round(count/s.sellerAnswered*100)} %</td></tr>`).join('')}</tbody></table></div>`:'<p class="sub">Aucune réponse exploitable.</p>'}</section>
 <section class="panel product-comparison"><h2>Achats visiteurs / VIP et meilleures ventes exposants</h2><div class="product-compare-legend"><span><i class="buyers"></i>Acheteurs · ${chart.buyerAnswered} répondants</span><span><i class="sellers"></i>Vendeurs · ${chart.sellerAnswered} répondants</span></div>${chart.products.length?`<div class="product-compare-axis" aria-hidden="true"><span>0 %</span><span>25 %</span><span>50 %</span><span>75 %</span><span>100 %</span></div><div class="product-compare-chart" role="group" aria-label="Comparaison en pourcentage des répondants, échelle de 0 à 100 %">${chart.products.map(p=>`<div class="product-compare-row"><span>${esc(p.label)}</span><div>${bar('Acheteurs',p.buyerPercent,p.buyerCount,chart.buyerAnswered,'buyers')}${bar('Vendeurs',p.sellerPercent,p.sellerCount,chart.sellerAnswered,'sellers')}</div></div>`).join('')}</div>`:'<p class="sub">Aucune réponse exploitable.</p>'}<p class="sub product-compare-note">Part des répondants ayant sélectionné chaque produit, calculée séparément pour les acheteurs et les vendeurs. Plusieurs choix possibles : le total peut dépasser 100 %. Les gammes de Singles sont regroupées en cartes à l’unité, une seule fois par répondant. — : aucune réponse exploitable ou catégorie non proposée dans ce formulaire. Les acheteurs déclarent leurs achats ; les vendeurs citent leurs meilleures ventes.</p></section>`;
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
