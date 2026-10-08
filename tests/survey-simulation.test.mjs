import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSimulation,simulationCategory,projectedDistribution,projectedMetrics,projectedTotal,simulationDashboard} from '../src/survey-simulation.js';
import {productComparison} from '../src/survey-analytics.js';
import {surveyResultsMarkup} from '../src/survey-results.js';
import {generatePersonas} from '../src/survey-personas.js';
const questions=[{key:'community',label:'Communauté',kind:'checkbox',options:['Basket','TCG']},{key:'spend',label:'Combien as-tu dépensé ?',kind:'short'},{key:'score',label:'Satisfaction globale',kind:'rating10'},{key:'purchase',label:'Type d’achat',kind:'checkbox',options:['Singles','Boxes']}];
const visitor=(community='Basket',extras={})=>({type:'visiteur',questions,answers:{community:[community],spend:'100 €',score:8,purchase:['Singles'],returnIntent:'Oui',...extras}});
const premium=ticket=>({...visitor(),type:'vip',questions:[{key:'vip_ticket',label:'Quel billet avais-tu ?',kind:'choice',options:['VIP','Early Access']},...questions],answers:{...visitor().answers,vip_ticket:ticket,spend:'200 €',score:10}});
const exhibitor=status=>({type:'exposant',questions:[{key:'q1_status',label:'Quel était votre statut sur le salon ?'},{key:'q12_best_sellers',label:'Quels produits se sont le mieux vendus sur votre stand ?',kind:'checkbox'}],answers:{q1_status:status,q12_best_sellers:['Singles petit budget'],returnIntent:'Non'}});
const base=()=>[visitor(),visitor('TCG'),premium('VIP'),premium('Early Access'),exhibitor('Professionnel'),exhibitor('Particulier'),exhibitor('Partenaire')];

test('simulation : cinq coefficients distincts et effectifs 2700 + 150 + 150 + 110 + 5',()=>{
 const rows=base(),saved=structuredClone(rows),model=buildSimulation(rows);
 assert.deepEqual(model.groups.map(g=>g.coefficient),[1350,150,150,55,5]);assert.equal(projectedTotal(model.rows),3115);assert.equal(model.covered,3115);assert.equal(model.observed,7);assert.deepEqual(rows,saved);
 assert.equal(projectedTotal(model.rows.filter(r=>r.type!=='exposant')),3000);assert.equal(projectedTotal(model.rows.filter(r=>r.type==='exposant')),115);
 const d=projectedDistribution(model.rows.filter(r=>r.type==='visiteur'),r=>r.answers.community);assert.equal(d.answered,2700);assert.deepEqual(d.entries,[['Basket',1350],['TCG',1350]]);
});
test('moyennes intra-groupe inchangées, synthèse recalée selon le poids des publics',()=>{
 const model=buildSimulation(base()),m=projectedMetrics(model.rows);
 assert.equal(m.spend.average,110);assert.equal(m.returning.yes,3000);assert.equal(m.returning.no,115);assert.equal(m.returning.percent,96);
 assert.equal(projectedMetrics(model.rows.filter(r=>r.type==='visiteur')).score.average,8);assert.equal(projectedMetrics(model.rows.filter(r=>r._projectionCategory==='vip')).score.average,10);
 const chart=productComparison(model.rows);assert.equal(chart.buyerAnswered,3000);assert.equal(chart.sellerAnswered,115);assert.equal(chart.products.find(p=>p.label==='Cartes à l’unité').buyerPercent,100);
});
test('coefficient calculé avant filtre : Basket ne devient pas artificiellement 3000 visiteurs',()=>{
 const html=simulationDashboard(buildSimulation(base()),'visiteur','Basket');assert.match(html,/1 350|1 350/);assert.doesNotMatch(html,/Effectif simulé<\/span><strong>≈ 2/);
});
test('groupes sans données et anciens billets non identifiés restent non estimables',()=>{
 const rows=[visitor(),{type:'vip',answers:{}},exhibitor('Professionnel')],model=buildSimulation(rows);
 assert.equal(model.unknown,1);assert.equal(model.groups.find(g=>g.id==='vip').coefficient,null);assert.equal(model.groups.find(g=>g.id==='partenaire').coefficient,null);assert.equal(model.covered,2810);assert.equal(model.rows[1]._projectionWeight,0);
 assert.equal(simulationCategory({type:'vip',answers:{premiumType:'Early Access Premium'}}),'early');assert.equal(buildSimulation([]).covered,0);
 const html=surveyResultsMarkup(rows,'all',2026,{simulation:true});assert.match(html,/Non estimable/);assert.match(html,/sans catégorie identifiable/);
});
test('interrupteur dans chaque onglet, export et réponses réelles préservés, pas de faux personas',()=>{
 for(const tab of ['all','visiteur','vip','exposant','responses','personas'])assert.match(surveyResultsMarkup(base(),tab,2026,{simulation:true}),/data-survey-simulation checked/);
 assert.doesNotMatch(surveyResultsMarkup(base(),'all',2027,{simulation:true}),/data-survey-simulation|Effectif simulé/);
 const model=buildSimulation([visitor()]);assert.equal(generatePersonas(model.rows).global.length,0);
 const html=surveyResultsMarkup(base(),'responses',2026,{simulation:true});assert.match(html,/Seules les réponses réelles/);assert.equal((html.match(/<details><summary><span>/g)||[]).length,7);
});


test('VIP et Early : la note du sac reste conditionnelle, les montants sont projetés',()=>{
 const vip=premium('VIP'),early=premium('Early Access');
 const bag={key:'vip_bag',label:'Qualité du sac VIP',kind:'rating10',showIf:{key:'vip_ticket',equals:'VIP'}};
 vip.questions.push(bag);early.questions.push(bag);vip.answers.vip_bag=10;early.answers.vip_bag=1;
 const model=buildSimulation([vip,early]);const html=simulationDashboard(model,'vip','');
 assert.match(html,/Qualité du sac VIP · 10,0\/10/);assert.doesNotMatch(html,/Qualité du sac VIP · 5,5/);assert.match(html,/Combien as-tu dépensé/);
});
