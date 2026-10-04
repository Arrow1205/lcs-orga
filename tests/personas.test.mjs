import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePersonas,personasMarkup} from '../src/survey-personas.js';
import {surveyResultsMarkup} from '../src/survey-results.js';

const questions=[
 {key:'q_age',label:'Quelle est ta tranche d’âge ?',kind:'dropdown'},
 {key:'q_gender',label:'Quel est ton genre ?',kind:'choice'},
 {key:'q_interest',label:'Quel type de cartes recherches-tu ?',kind:'choice'},
 {key:'q_identity',label:'Nom de ta société',kind:'short'}
];
function visitor(community,age,gender,interest,extra={}){return {type:'visiteur',questions,answers:{community,returnIntent:'Oui',q_age:age,q_gender:gender,q_interest:interest,q_identity:'Non publié',...extra}}}

test('les profils globaux et communautaires découlent des réponses et gardent des effectifs vérifiables',()=>{
 const rows=[
  visitor(['Basket','TCG'],'25–34','Femme','Cartes de sport'),
  visitor(['Basket'],'25–34','Femme','Cartes de sport'),
  visitor(['Basket'],'35–44','Homme','Cartes TCG'),
  visitor(['Basket'],'35–44','Homme','Cartes TCG'),
  visitor(['Basket'],'45–54','Femme','Cartes vintage'),
  visitor(['Basket'],'45–54','Femme','Cartes vintage'),
  visitor(['Soccer'],'25–34','Femme','Cartes de sport'),
  visitor(['Soccer'],'25–34','Femme','Cartes de sport'),
  visitor(['TCG'],'35–44','Homme','Cartes TCG'),
  visitor(['TCG'],'35–44','Homme','Cartes TCG')
 ];
 const result=generatePersonas(rows);
 assert.equal(result.global.length,5);
 assert.equal(result.global.reduce((sum,p)=>sum+p.count,0),10);
 const basket=result.communities.find(c=>c.name==='Basket');
 assert.equal(basket.total,6);
 assert.equal(basket.profiles.length,3);
 assert.equal(basket.profiles.reduce((sum,p)=>sum+p.count,0),6);
 assert.ok(result.global.every(p=>p.count>=2));
 assert.ok(result.global.flatMap(p=>p.facts).every(f=>f.count>=2&&f.count<=f.answered));
 const html=personasMarkup(rows,true);
 assert.match(html,/25–34/);
 assert.doesNotMatch(html,/Non publié/);
 assert.match(html,/2\/2 réponses renseignées/);
});

test('ne fabrique pas les profils manquants et ignore le filtre communautaire global',()=>{
 const rows=[visitor(['Basket'],'25–34','Femme','Cartes de sport')];
 const result=generatePersonas(rows);
 assert.equal(result.global.length,0);
 assert.equal(result.communities[0].profiles.length,0);
 assert.match(personasMarkup(rows,true),/Les profils manquants ne sont pas inventés/);
 const initial=surveyResultsMarkup(rows,'personas',2026,{community:'Soccer'});
 assert.match(initial,/Générer les personas/);
 assert.doesNotMatch(initial,/Vue Soccer/);
 const rendered=surveyResultsMarkup(rows,'personas',2026,{community:'Soccer',personasGenerated:true});
 assert.match(rendered,/Basket/);
 assert.match(rendered,/1 réponse analysée/);
});
