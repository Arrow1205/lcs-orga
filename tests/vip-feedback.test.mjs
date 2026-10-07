import test from 'node:test';
import assert from 'node:assert/strict';
import {duplicateVisitorForVip,vipQuestions} from '../src/vip-schema.js';
import {activeQuestions,pruneInactiveAnswers,validateAnswers} from '../src/survey-schema.js';
import {vipStats,vipFeedbackMarkup} from '../src/vip-feedback.js';
import {visitorStats,communityValues,answerFor} from '../src/visitor-feedback.js';
import {surveyResultsMarkup} from '../src/survey-results.js';

const visitor=Array.from({length:20},(_,i)=>({key:`visitor_${i+1}`,label:`Question ${i+1}`,kind:'short'}));
visitor[0]={...visitor[0],label:'Communautés',kind:'checkbox',options:['Basket','TCG']};
visitor[8]={...visitor[8],kind:'choice',options:['Oui','Non']};
visitor[9]={...visitor[9],kind:'checkbox',options:['Singles','Box'],showIf:{key:visitor[8].key,equals:'Oui'}};
visitor[15]={...visitor[15],kind:'rating10'};
const defs=duplicateVisitorForVip(visitor);
const make=(ticket,score,bag)=>({type:'vip',questions:defs,answers:{vip_ticket:ticket,vip_price:'Bon rapport qualité/prix',vip_duration:'Adaptée',vip_community_pack:'Oui',visitor_1:['Basket'],visitor_9:'Non',visitor_16:score,visitor_17:'Oui',visitor_14:'Plus de place',visitor_15:'Super ambiance',visitor_20:'Plus de cartes',...(bag===undefined?{}:{vip_bag:bag})}});

test('copie visiteur et conditions préservées, sac obligatoire uniquement pour VIP',()=>{
 assert.equal(defs.length,25);
 assert.deepEqual(defs.slice(5),visitor);
 assert.equal(activeQuestions('vip',{vip_ticket:'Early Access'},defs).some(q=>q.key==='vip_bag'),false);
 assert.ok(validateAnswers('vip',make('Early Access',8).answers,defs));
 assert.ok(!validateAnswers('vip',make('VIP',8).answers,defs));
 assert.ok(validateAnswers('vip',make('VIP',8,10).answers,defs));
 assert.ok(!validateAnswers('vip',make('VIP',8,11).answers,defs));
 const answers=make('Early Access',8,9).answers;pruneInactiveAnswers('vip',answers,defs);
 assert.equal(answers.vip_bag,undefined);
 assert.equal(activeQuestions('vip',answers,defs).some(q=>q.key==='visitor_10'),false);
 const clone=duplicateVisitorForVip(visitor);clone[5].label='Modifiée';assert.equal(visitor[0].label,'Communautés');
 assert.throws(()=>duplicateVisitorForVip(vipQuestions));
});

test('dashboard VIP : notes, ratios par réponses, communautés et Q21 sans décalage conditionnel',()=>{
 const rows=[make('VIP',8,10),make('VIP',10,6),make('Early Access',6,0),{type:'visiteur',answers:{vip_bag:0}},make('Early Access',4)];
 rows[1].answers.vip_price='Trop cher';rows[2].answers.vip_community_pack='Non';delete rows[3].answers.vip_price;delete rows[4].answers.vip_price;
 const stats=vipStats(rows,defs);
 assert.equal(stats.total,4);assert.equal(stats.bagCount,2);assert.equal(stats.bagAverage,8);
 assert.equal(stats.goodValue,67);assert.equal(stats.packInterest,75);
 assert.equal(visitorStats(rows,defs,{type:'vip'}).score,7);
 assert.equal(answerFor(rows[0],'satisfaction'),8);
 assert.deepEqual(communityValues(rows[0]),['Basket']);
 assert.deepEqual(rows.flatMap(communityValues),['Basket','Basket','Basket','Basket']);
 const markup=vipFeedbackMarkup(rows,defs);
 assert.match(markup,/8,0\/10/);assert.match(markup,/Q21 · 4 note/);
 assert.match(markup,/Q19 · Points négatifs/);assert.match(markup,/Q20 · Points positifs/);
 assert.match(markup,/Q25 · Retours libres/);assert.match(markup,/Super ambiance/);
 assert.match(surveyResultsMarkup(rows,'vip',2026,{forms:{vip:{questions:defs}}}),/Qualité du sac VIP/);
});
