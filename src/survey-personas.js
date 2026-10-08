import {communityValues} from './visitor-feedback.js';
import {surveyAnswer,sellerType,surveyQuestion,frequency,purchaseSpend,returningStats} from './survey-analytics.js';
import {normalizeVerbatim,groupComments} from './feedback-themes.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meaningful=['purchase','spend','duration','returnIntent','bestSellers','revenue','spaceFit','spaceLimit','flow','salesExpectations','bookingType'];
const categories=[['community-basket','Basket','Basket'],['community-soccer','Soccer','Soccer'],['community-tcg','TCG','TCG'],['community-sports-us','Sports US','Sports US'],['seller-particulier','Vendeurs particuliers','Particulier'],['seller-professionnel','Vendeurs professionnels','Professionnel'],['seller-partenaire','Partenaires','Partenaire']];
const known=[['age','Âge'],['gender','Genre'],['purchase','Achats'],['spend','Panier'],['duration','Temps sur place'],['returnIntent','Retour'],['bestSellers','Produits vendus'],['revenue','Chiffre d’affaires'],['spaceFit','Espace'],['spaceLimit','Manque de place'],['flow','Flux visiteurs'],['salesExpectations','Ventes / attentes']];
function entries(records,field,forms){return frequency(records.map(row=>surveyAnswer(row,field,forms)))}
function fact(records,field,label,forms){const values=entries(records,field,forms),answered=records.filter(r=>{const v=surveyAnswer(r,field,forms);return Array.isArray(v)?v.length:v!==undefined&&v!==null&&v!==''}).length;const top=values[0];return top?{key:field,label,value:top[0],count:top[1],answered}:null}
function supported(records,forms){return meaningful.some(field=>entries(records,field,forms).some(([,n])=>n>=2));}
function split(records,forms){
 let best=null;
 for(const field of meaningful){const values=entries(records,field,forms);for(const [value] of values){
  const yes=records.filter(row=>{const raw=surveyAnswer(row,field,forms);return Array.isArray(raw)?raw.includes(value):raw===value});
  const no=records.filter(row=>!yes.includes(row)&&surveyAnswer(row,field,forms)!==undefined&&surveyAnswer(row,field,forms)!==null&&surveyAnswer(row,field,forms)!=='');
  if(yes.length<2||no.length<2||yes.length+no.length!==records.length||!supported(yes,forms)||!supported(no,forms))continue;
  const score=Math.min(yes.length,no.length);if(!best||score>best.score)best={score,yes,no,field,value};
 }}return best;
}
function segments(records,forms){if(records.length<2||!supported(records,forms))return [];const s=split(records,forms);return s?[s.yes,s.no]:[records]}
function themes(records,field,forms){return groupComments(records.map(row=>surveyAnswer(row,field,forms)).filter(v=>typeof v==='string'&&v.trim()),field==='highlights'?'highlights':'improvements')}
function distinctiveTheme(records,all,field,forms,used){
 const local=themes(records,field,forms),global=themes(all,field,forms);
 const sorted=local.map(g=>({...g,specificity:g.count/records.length-(global.find(x=>x.name===g.name)?.count||0)/Math.max(all.length,1)})).sort((a,b)=>b.specificity-a.specificity||b.count-a.count);
 const theme=sorted.find(g=>g.quotes.some(q=>!used.has(normalizeVerbatim(q.text))))||sorted[0];
 if(!theme)return null;const quote=theme.quotes.find(q=>!used.has(normalizeVerbatim(q.text)))||theme.quotes[0];used.add(normalizeVerbatim(quote.text));return {...theme,quote};
}
const names=['Alex','Camille','Samir','Nora','Julien','Inès','Thomas','Lina','Mehdi','Laura','Maxime','Géraldine','Lou','Robin'];
function profile(records,index,category,all,forms,used){
 const facts=known.map(([field,label])=>fact(records,field,label,forms)).filter(f=>f&&f.count>=2&&f.count/f.answered>.5);
 const sellers=category[0].startsWith('seller-'),spend=purchaseSpend(records,forms),returning=returningStats(records,forms);
 const positive=distinctiveTheme(records,all,'highlights',forms,used.positive),negative=distinctiveTheme(records,all,'improvements',forms,used.negative);
 const purchase=facts.find(f=>f.key===(sellers?'bestSellers':'purchase')),duration=facts.find(f=>f.key==='duration'),sales=facts.find(f=>f.key==='salesExpectations'),space=facts.find(f=>f.key==='spaceFit');
 const scores=records.map(r=>{const value=surveyAnswer(r,'satisfaction',forms);const q=surveyQuestion(r,'satisfaction',forms);return typeof value==='number'&&value>=0&&value<=(q?.kind==='rating10'?10:5)?value*10/(q?.kind==='rating10'?10:5):null}).filter(v=>v!==null);
 const average=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;
 const name=names[index%names.length],gender=facts.find(f=>f.key==='gender')?.value||'',image=/femme/i.test(gender)?`/personas/women${index%3+1}.png`:/homme/i.test(gender)?`/personas/men${index%3+1}.png`:`/personas/${index%2?'women':'men'}${index%3+1}.png`;
 const sentences=[`${name} représente un profil ${sellers?category[1].toLowerCase():`fan de ${category[1]}`} observé dans ${records.length} réponses.`];
 if(purchase)sentences.push(`${purchase.count}/${purchase.answered} ${sellers?'citent parmi leurs meilleures ventes':'déclarent acheter'} « ${purchase.value} ».`);
 if(spend.average!==null)sentences.push(`Le panier moyen estimé du groupe est de ${spend.average} € (${spend.count} montants exploitables).`);
 if(duration)sentences.push(`${duration.count}/${duration.answered} restent ${duration.value.toLowerCase()} sur place.`);
 if(sales)sentences.push(`Les ventes sont « ${sales.value} » pour ${sales.count}/${sales.answered} répondants.`);
 if(space)sentences.push(`L’espace est jugé « ${space.value} » par ${space.count}/${space.answered} exposants.`);
 if(average!==null)sentences.push(`La satisfaction moyenne atteint ${average.toFixed(1).replace('.',',')}/10 (${scores.length} notes).`);
 if(returning.answered)sentences.push(`${returning.yes}/${returning.answered} réponses Oui/Non indiquent une intention de revenir${returning.undecided?`, avec ${returning.undecided} indécis supplémentaires`:''}.`);
 if(negative&&average!==null&&average>=7)sentences.push(`La bonne note coexiste avec des remarques sur « ${negative.name} » : c’est un axe d’amélioration au sein d’un groupe globalement satisfait.`);
 const overallSpend=purchaseSpend(all,forms);
 if(!sellers&&spend.count>=2&&overallSpend.count>spend.count&&Math.abs(spend.average-overallSpend.average)>=10)sentences.push(`Ce groupe dépense ${spend.average>overallSpend.average?'davantage':'moins'} que l’ensemble ${category[1]} (${overallSpend.average} € estimés) ; cette différence de panier constitue un axe de segmentation, sans présumer son pouvoir d’achat.`);
 if(returning.no&&negative)sentences.push(`La présence de ${returning.no} intention(s) de ne pas revenir invite à examiner les irritants « ${negative.name} », sans pouvoir leur attribuer la décision de ces personnes.`);
 const motivation=positive?`${positive.count}/${records.length} retours citent « ${positive.name} ». Exemple : « ${positive.quote.text} ».`:purchase?`${purchase.count}/${purchase.answered} réponses convergent vers « ${purchase.value} ». C’est le principal intérêt déclaré de ce groupe.`:'Aucune motivation suffisamment documentée dans les réponses de ce groupe.';
 const frustration=negative?`${negative.count}/${records.length} retours évoquent « ${negative.name} ». Exemple : « ${negative.quote.text} ».`:'Aucune frustration documentée ne ressort pour ce groupe.';
 const evidence=[...facts.map(f=>({field:f.key,value:f.value,count:f.count,answered:f.answered})),...(positive?[{field:'highlights',theme:positive.name,count:positive.count,quote:positive.quote.text}]:[]),...(negative?[{field:'improvements',theme:negative.name,count:negative.count,quote:negative.quote.text}]:[])];
 return {id:`${category[0]}-${index%2+1}`,number:index%2+1,name,image,count:records.length,facts,summary:sentences.join(' '),motivation,frustration,evidence};
}
export function generatePersonas(rows,forms={}){
 const valid=rows.filter(r=>['visiteur','vip','exposant'].includes(r.type)),used={positive:new Set(),negative:new Set()};let index=0;
 const groups=categories.map(category=>{
  const records=valid.filter(row=>category[0].startsWith('seller-')?sellerType(row,forms)===category[2]:row.type!=='exposant'&&communityValues({...row,questions:row.questions?.length?row.questions:forms[row.type]?.questions||[]}).includes(category[2]));
  const subsets=segments(records,forms);
  return {id:category[0],name:category[1],total:records.length,profiles:subsets.map((subset,i)=>{const p=profile(subset,index++,category,records,forms,used);p.id=`${category[0]}-${i+1}`;p.number=i+1;return p})};
 });
 return {total:valid.length,groups,global:groups.flatMap(g=>g.profiles),communities:groups.filter(g=>g.id.startsWith('community-'))};
}
function profileCard(profile,{canEdit=false,overrides={},editing='',narratives={}}){
 const narrative=narratives[profile.id];if(narrative)profile={...profile,...narrative};
 const summary=overrides[profile.id]??profile.summary;
 return `<article class="panel persona-card persona-card-visual" data-persona-id="${esc(profile.id)}"><div class="persona-hero"><img src="${esc(profile.image)}" alt="Illustration persona"><div><span>${profile.count} réponse${profile.count>1?'s':''} regroupée${profile.count>1?'s':''}</span><h3>${esc(profile.name)}</h3></div></div>${editing===profile.id?`<div class="persona-edit"><textarea rows="7" data-persona-draft="${esc(profile.id)}">${esc(summary)}</textarea><div class="actions"><button type="button" class="btn small" data-persona-cancel>Annuler</button><button type="button" class="btn small primary" data-persona-save="${esc(profile.id)}">Enregistrer</button></div></div>`:`${narrative?'<small class="sub">Analyse IA · à relire avec les sources</small>':''}<p class="persona-summary">${esc(summary)}</p>`}<div class="persona-insights"><div><strong>Motivation</strong><p>${esc(profile.motivation)}</p></div><div><strong>Frustration</strong><p>${esc(profile.frustration)}</p></div><details><summary>Éléments qui fondent ce profil</summary>${profile.evidence.map(e=>`<p>${esc(e.quote||e.value||e.theme)} · ${e.count}${e.answered?'/'+e.answered:''} réponse(s)</p>`).join('')}</details></div>${canEdit?`<div class="actions persona-actions"><button type="button" class="btn small" data-persona-edit="${esc(profile.id)}">Modifier</button><button type="button" class="btn small danger" data-persona-delete="${esc(profile.id)}">Supprimer</button></div>`:''}</article>`;
}
export function personasMarkup(rows,generated=false,options={}){
 if(!generated)return `<section class="panel persona-intro"><h2>Personas issus des retours</h2><p>Jusqu’à deux profils Basket, Soccer, TCG, Sports US, vendeurs particuliers, professionnels et partenaires. Chaque profil exige au moins deux réponses partageant un comportement renseigné ; un second profil exige une différence observable.</p><button type="button" class="btn primary" data-survey-generate-personas>Générer les personas</button></section>`;
 const result=generatePersonas(rows,options.forms||{}),opts={canEdit:false,overrides:{},deleted:new Set(),editing:'',...options};
 return `<div class="persona-dashboard"><section class="panel persona-intro"><div class="panel-head"><div><h2>Personas issus des retours</h2><p class="sub">${result.total} réponse${result.total>1?'s':''} analysée${result.total>1?'s':''} · ${result.global.length} profils étayés.</p></div><div class="actions">${opts.aiConfigured&&result.global.length?`<button type="button" class="btn small" data-survey-persona-ai ${opts.aiBusy?'disabled':''}>${opts.aiBusy?'Analyse en cours…':'Approfondir avec l’IA'}</button>`:''}<button type="button" class="btn small" data-survey-generate-personas>Regénérer</button></div></div><p class="sub">Les prénoms et illustrations sont fictifs. Les comportements, montants et citations proviennent des réponses. Les communautés peuvent se recouper ; les profils manquants ne sont pas inventés.</p></section>${result.groups.map(g=>{const profiles=g.profiles.filter(p=>!opts.deleted.has(p.id));return `<section class="persona-section"><h2>${esc(g.name)} <small>· ${profiles.length}/2 profils · ${g.total} réponses disponibles</small></h2>${profiles.length?`<div class="persona-grid">${profiles.map(p=>profileCard(p,opts)).join('')}</div>`:'<p class="sub">Il faut au moins deux réponses comparables et un comportement commun renseigné pour former un profil.</p>'}${profiles.length<2?'<p class="sub">Les profils manquants ne sont pas inventés.</p>':''}</section>`}).join('')}</div>`;
}
