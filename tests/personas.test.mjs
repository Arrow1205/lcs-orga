import test from 'node:test';
import assert from 'node:assert/strict';
import {generatePersonas,personasMarkup} from '../src/survey-personas.js';
import {surveyResultsMarkup} from '../src/survey-results.js';

const questions=[
 {key:'q_age',label:'Quelle est ta tranche d’âge ?',kind:'dropdown'},
 {key:'q_gender',label:'Quel est ton genre ?',kind:'choice'},
 {key:'q_interest',label:'Qu’est ce que tu as acheté ?',kind:'checkbox'},
 {key:'q_spend',label:'Combien tu as dépensé ?',kind:'short'},
 {key:'q_companions',label:'Tu es venu seul ou accompagné ?',kind:'choice'},
 {key:'q_improvements',label:'Qu’est ce qui t’a gêné ou que tu aimerais améliorer ?',kind:'text'},
 {key:'q_duration',label:'Combien de temps es-tu resté sur le salon ?',kind:'choice'},
 {key:'q_discovery',label:'Comment as-tu entendu parler du salon ?',kind:'checkbox'},
 {key:'q_satisfaction',label:'Note globale du salon',kind:'rating10'},
 {key:'q_food',label:'As-tu acheté à manger sur place ?',kind:'choice'},
 {key:'q_identity',label:'Nom de ta société',kind:'short'}
];
function visitor(community,age,gender,interest,extra={}){return {type:'visiteur',questions,answers:{community,returnIntent:'Oui',q_age:age,q_gender:gender,q_interest:Array.isArray(interest)?interest:[interest],q_spend:'50 €',q_companions:'avec ses enfants',q_improvements:'Trop de monde dans les allées',q_duration:'2 à 3 heures',q_discovery:['Instagram'],q_satisfaction:8,q_food:'Oui',q_identity:'Non publié',...extra}}}

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
 assert.match(html,/Alex/);
 assert.match(html,/passionné de/);
 assert.match(html,/reste 2 à 3 heures sur le salon/);
 assert.match(html,/panier moyen 50 €/);
 assert.match(html,/a découvert le salon via Instagram/);
 assert.match(html,/note l’expérience 8/);
 assert.match(html,/acheté à manger sur place \? : Oui/i);
 assert.match(html,/malgré/);
 assert.match(html,/Friction principale/);
 assert.doesNotMatch(html,/Non publié/);
 assert.match(html,/2\/2 réponses renseignées/);
 const edited=personasMarkup(rows,true,{canEdit:true,overrides:{'global-1':'Persona réécrit à la main.'},deleted:new Set(['global-2']),editing:'global-1'});
 assert.match(edited,/Persona réécrit à la main/);
 assert.match(edited,/data-persona-save="global-1"/);
 assert.match(edited,/data-persona-delete="global-1"/);
 assert.doesNotMatch(edited,/data-persona-id="global-2"/);
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
