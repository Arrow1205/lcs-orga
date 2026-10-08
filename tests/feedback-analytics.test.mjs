import test from 'node:test';
import assert from 'node:assert/strict';
import {returnCounts,bucketAmount,gridScore} from '../src/feedback-metrics.js';
import {exhibitorStats} from '../src/exhibitor-feedback.js';
import {surveyStats,surveyResultsMarkup} from '../src/survey-results.js';
import {generateSummary,purchaseSpend,comparisonStats,productComparison,comparisonMarkup} from '../src/survey-analytics.js';
import {generatePersonas} from '../src/survey-personas.js';
import handler,{aiConfiguration,analyzePersonas,validateNarratives} from '../api/feedback-analysis.js';

test('retour : Oui et Non ont un dénominateur commun sans absents ni indécis',()=>{
 assert.deepEqual(returnCounts(['Oui, certainement','Oui, probablement','Probablement pas','Non','Je ne sais pas encore',null]),{yes:2,no:2,undecided:1,missing:1,answered:4,percent:50});
 const rows=[...Array.from({length:10},()=>({type:'visiteur',answers:{returnIntent:'Oui'}})),...Array.from({length:12},()=>({type:'vip',answers:{returnIntent:'Oui'}})),{type:'vip',answers:{returnIntent:'Non'}},{type:'exposant',answers:{}},{type:'visiteur',answers:{returnIntent:'Je ne sais pas'}}];
 assert.equal(surveyStats(rows).returning.percent,96);
 assert.equal(surveyStats(rows).returning.answered,23);
 assert.equal(returnCounts([undefined,'Je ne sais pas']).percent,null);
});
test('logistique : conserve les votes et calcule les notes sur formats historiques et verbaux',()=>{
 const numeric={key:'logistics',label:'Sur la logistique pure, comment évalueriez-vous les éléments suivants ?',kind:'grid',rows:['Accès au stand'],columns:['1','2','3','4','5']};
 const verbal={...numeric,columns:['Très inconfortable','Inconfortable','Neutre','Confortable','Très confortable']};
 const rows=[{type:'exposant',questions:[numeric],answers:{logistics:{'Accès au stand':4}}},{type:'exposant',questions:[verbal],answers:{logistics:{'Accès au stand':'Très confortable'}}},{type:'exposant',questions:[numeric],answers:{logistics:{'Accès au stand':'Non concerné'}}}];
 const s=exhibitorStats(rows,[numeric]);assert.equal(s.logistics.rows[0].total,3);assert.equal(s.logistics.rows[0].scored,2);assert.equal(s.logistics.rows[0].average,4.5);assert.equal(s.logistics.rows[0].counts.reduce((a,c)=>a+c.count,0),3);
 assert.equal(gridScore('Inconfortable',verbal.columns),2);assert.equal(gridScore('Très confortable',[...verbal.columns].reverse()),5);
});
test('panier synthèse : tranches françaises, montants absents et vendeurs exclus',()=>{
 assert.equal(bucketAmount('1 000 à 2 000 €'),1500);assert.equal(bucketAmount('12,50 €'),12.5);assert.equal(bucketAmount('Je préfère ne pas répondre'),null);
 const questions=[{key:'spend',label:'Combien as-tu dépensé ?',kind:'short'}];
 const rows=[{type:'visiteur',questions,answers:{spend:'100 à 200 €',purchase:['Singles']}},{type:'vip',questions,answers:{spend:'250 €'}},{type:'exposant',answers:{spend:9000,vendorType:'Professionnel'}}];
 assert.deepEqual(purchaseSpend(rows),{count:2,average:200});assert.deepEqual(comparisonStats(rows).sellerTypes,[['Professionnel',1]]);
 const summary=generateSummary(rows);assert.equal(summary.sections.length,4);assert.match(summary.sections[3].text,/200 € sur 2 réponses/);assert.doesNotMatch(summary.sections[3].text,/9000/);
 assert.equal(generateSummary([]).evidence.spend.average,null);
});
test('VIP : aucun filtre vendeur ; synthèse propose un bouton et le panier',()=>{
 const rows=[{type:'exposant',answers:{community:'Professionnel'}},{type:'vip',answers:{community:['Basket']}}];
 const html=surveyResultsMarkup(rows,'vip',2026);assert.doesNotMatch(html,/<option[^>]*>Professionnel<\/option>/);assert.match(html,/>Basket<\/option>/);
 const summary=surveyResultsMarkup(rows,'all',2026,{summaryGenerated:true});assert.match(summary,/data-survey-generate-summary/);assert.match(summary,/Panier moyen/);assert.match(summary,/#4 · Le panier moyen/);
});
test('personas : sept catégories, deux profils fondés si différences et réponses suffisantes',()=>{
 const rows=[];for(const community of ['Basket','Soccer','TCG','Sports US'])for(const purchase of ['Singles','Boxes'])for(let i=0;i<2;i++)rows.push({type:'visiteur',answers:{community:[community],purchase:[purchase],returnIntent:'Oui'}});
 for(const status of ['Particulier','Professionnel','Partenaire'])for(const revenue of ['250 à 500 €','2 000 à 5 000 €'])for(let i=0;i<2;i++)rows.push({type:'exposant',questions:[{key:'status',label:'Quel était votre statut sur le salon ?'},{key:'revenue',label:'Quel chiffre d’affaires approximatif avez-vous réalisé pendant le salon ?'}],answers:{status,revenue,returnIntent:'Oui'}});
 const result=generatePersonas(rows);assert.equal(result.groups.length,7);assert.ok(result.groups.every(g=>g.profiles.length===2));assert.ok(result.global.every(p=>p.count===2));
 assert.equal(generatePersonas([{type:'visiteur',answers:{community:['Basket']}},{type:'visiteur',answers:{community:['Basket']}}]).global.length,0);
});
test('analyse IA : clés serveur, sorties strictes et refus des profils ou sources inventés',async()=>{
 assert.equal(aiConfiguration({}).configured,false);assert.equal(aiConfiguration({FEEDBACK_AI_PROVIDER:'openai',FEEDBACK_AI_MODEL:'model',OPENAI_API_KEY:'key'}).configured,true);
 const profiles=[{id:'community-basket-1',evidence:[{id:'e0',value:'Singles',count:2}]}],output={profiles:[{id:profiles[0].id,summary:'Analyse fondée',motivation:'Intérêt déclaré',frustration:'Pas de retour documenté',evidenceIds:['e0']}]};
 let request;const result=await analyzePersonas(profiles,{provider:'openai',model:'model',key:'server-key'},async(url,options)=>{request={url,options};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(output)}]}]})}});
 assert.equal(result[profiles[0].id].summary,'Analyse fondée');assert.equal(JSON.parse(request.options.body).text.format.strict,true);
 assert.throws(()=>validateNarratives({profiles:[{...output.profiles[0],evidenceIds:['fake']}]},profiles));assert.throws(()=>validateNarratives({profiles:[{...output.profiles[0],id:'fake'}]},profiles));
});


test('analyse IA : accès anonyme refusé avant tout appel aux fournisseurs',async()=>{
 const res={setHeader(){},status(code){this.code=code;return this},json(data){this.data=data;return this}};
 await handler({method:'POST',headers:{},body:{}},res);assert.equal(res.code,401);
});

test('Gemini utilise une sortie structurée et la même validation des sources',async()=>{
 const profiles=[{id:'seller-partenaire-1',evidence:[{id:'e0'}]}];let payload;
 const output={profiles:[{id:profiles[0].id,summary:'Constat étayé',motivation:'Motivation documentée',frustration:'Non documentée',evidenceIds:['e0']}]};
 const result=await analyzePersonas(profiles,{provider:'gemini',model:'configured-model',key:'key'},async(url,options)=>{assert.match(url,/configured-model:generateContent$/);payload=JSON.parse(options.body);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]})}});
 assert.equal(payload.generationConfig.responseMimeType,'application/json');assert.ok(payload.generationConfig.responseJsonSchema);assert.equal(result[profiles[0].id].summary,'Constat étayé');
});


test('doubles barres : mêmes catégories, répondants distincts et dénominateurs par public',()=>{
 const buyerQuestions=[{key:'purchase',label:'Type d’achat',options:["Carte(s) à l’unité",'Boxes','Produits dérivés']}],sellerQuestions=[{key:'q12_best_sellers',label:'Quels produits se sont le mieux vendus sur votre stand ?',options:['Singles petit budget','Singles premium / High-End','Boxes / Displays','Cartes gradées']}];
 const rows=[{type:'visiteur',questions:buyerQuestions,answers:{purchase:["Carte(s) à l’unité"]}},{type:'vip',questions:buyerQuestions,answers:{purchase:['Boxes']}},{type:'visiteur',questions:buyerQuestions,answers:{}},{type:'exposant',questions:sellerQuestions,answers:{q12_best_sellers:['Singles petit budget','Singles premium / High-End','Cartes gradées']}},{type:'exposant',questions:sellerQuestions,answers:{q12_best_sellers:['Cartes gradées']}}];
 const c=productComparison(rows);assert.equal(c.buyerAnswered,2);assert.equal(c.sellerAnswered,2);
 const singles=c.products.find(p=>p.label==='Cartes à l’unité');assert.equal(singles.buyerPercent,50);assert.equal(singles.sellerPercent,50);assert.equal(singles.sellerCount,1);
 const boxes=c.products.find(p=>p.label==='Boxes / Displays');assert.equal(boxes.buyerPercent,50);assert.equal(boxes.sellerPercent,0);
 const graded=c.products.find(p=>p.label==='Cartes gradées');assert.equal(graded.buyerPercent,null);assert.equal(graded.sellerPercent,100);
 const html=comparisonMarkup(rows);assert.match(html,/width:50%/);assert.match(html,/width:100%/);assert.match(html,/Acheteurs · 2 répondants/);assert.doesNotMatch(html,/Produits vendus par type de vendeur|Types d’achat · visiteurs et VIP|Produits vendus · exposants/);
 assert.ok(productComparison(rows.filter(r=>r.type!=='exposant')).products.every(p=>p.sellerPercent===null));
});
