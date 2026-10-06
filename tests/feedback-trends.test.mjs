import test from 'node:test';
import assert from 'node:assert/strict';
import {groupComments,themesFor} from '../src/feedback-themes.js';
import {visitorFeedbackMarkup,visitorStats} from '../src/visitor-feedback.js';

test('les formulations proches forment une tendance et les doublons gardent leur volume',()=>{
 const praise=groupComments(['Ne changez rien !','Vous êtes parfaits','ne changez rien'], 'highlights');
 assert.equal(praise.find(g=>g.name==='Éloges').count,3);
 assert.equal(praise.find(g=>g.name==='Éloges').quotes.find(q=>q.text==='Ne changez rien !').count,2);
 const crowd=groupComments(['Trop de monde','Les allées étaient impraticables à cause de la foule'],'improvements');
 assert.equal(crowd.find(g=>g.name==='Forte affluence').count,2);
 assert.deepEqual(themesFor('Avis inédit sans mots clés'),['Autres retours']);
 const screenshot=groupComments(['la foulles les allées etait trop petite, on ne pouvait pas circuler dans ni acceder aux stands','le monde'],'improvements');
 assert.equal(screenshot.find(g=>g.name==='Forte affluence').count,2);
 assert.equal(screenshot.find(g=>g.name==='Exposants et offre'),undefined);
 assert.equal(screenshot.find(g=>g.name==='Autres retours'),undefined);
 assert.ok(themesFor('Manque de diversité des exposants').includes('Exposants et offre'));
});

test('camemberts lisibles et tendances vérifiables dans la vue visiteurs',()=>{
 const questions=[{key:'age',label:'Quelle est ta tranche d’âge ?'},{key:'gender',label:'Quel est ton genre ?'},{key:'buy',label:'Qu’est ce que tu as acheté ?'},{key:'spend',label:'Combien as-tu dépensé ?'},{key:'duration',label:'Combien de temps es-tu resté sur le salon ?'},{key:'collection',label:'Depuis combien de temps tu collectionnes ?'},{key:'paid',label:'Es-tu prêt à payer l’entrée l’an prochain ?'},{key:'entryPrice',label:'Combien serais-tu prêt à mettre ?'}];
 const rows=[{type:'visiteur',questions,answers:{community:['Basket','Soccer'],age:'25-34',gender:'Femme',buy:['Cartes','Goodies'],spend:'100 à 150 €',duration:'2 à 3 heures',collection:'Plus de 5 ans',paid:'Oui',entryPrice:'12,50 €',returnIntent:'Oui',highlights:'Ne changez rien',improvements:'Trop de monde'}},{type:'visiteur',questions,answers:{community:['Basket'],age:'35-44',gender:'Homme',buy:['Cartes'],spend:'50 à 100 €',duration:'1 à 2 heures',collection:'Moins de 1 an',paid:'Non',entryPrice:'8',returnIntent:'Non',highlights:'Vous êtes parfaits',improvements:'Les allées impraticables'}}];
 const html=visitorFeedbackMarkup(rows);
 assert.equal((html.match(/class="visitor-pie"/g)||[]).length,8);
 assert.match(html,/Communautés : Basket : 2, Soccer : 1/);
 assert.match(html,/Les pourcentages indiquent la part des répondants/);
 assert.match(html,/Type d’achat : Cartes : 2, Goodies : 1/);
 assert.match(html,/Prêt à payer l’entrée l’an prochain : Non : 1, Oui : 1/);
 assert.match(html,/Prêt à payer l’an prochain/);
 assert.match(html,/Q19 moyen · Oui 50 % · Non 50 %/);
 assert.match(html,/Éloges/);
 assert.match(html,/Forte affluence/);
 assert.match(html,/Ne changez rien/);
 const stats=visitorStats(rows);
 assert.equal(stats.averageSpend,100);
 assert.equal(stats.averageEntryPrice,10);
 assert.equal(stats.topPurchase,'Cartes');
 assert.deepEqual(stats.distributions.duration.map(([label])=>label).sort(),['1 à 2 heures','2 à 3 heures']);
 assert.deepEqual(stats.distributions.collectionAge.map(([label])=>label).sort(),['Moins de 1 an','Plus de 5 ans']);
});

test('les questions conditionnelles absentes ne décalent pas les KPI suivants',()=>{
 const questions=Array.from({length:20},(_,i)=>({key:`q${i+1}`,label:`Question ${i+1}`,kind:'choice'}));
 questions[0].label='Communauté';questions[1].label='Âge';questions[2].label='Genre';questions[3].label='Type de visiteur';questions[4].label='Ville';questions[5].label='Découverte';questions[6].label='Collectionneur depuis';questions[7].label='Temps passé';questions[8].label='A réalisé un achat';questions[9].label='Type d’achat';questions[10].label='Montant dépensé';questions[11].label='Venue avec';questions[12]={key:'q13',label:'Que penses-tu de',kind:'grid',rows:['Accueil'],columns:['Très bien','Bien']};questions[13].label='Point négatif';questions[14].label='Point positif';questions[15]={key:'q16',label:'Satisfaction globale',kind:'rating10'};questions[16].label='Envie de revenir';questions[17].label='Prêt à payer l’entrée l’an prochain';questions[18].label='Combien serais-tu prêt à mettre';questions[19].label='Retour libre';
 const base={type:'visiteur',questions:null,answers:{q1:['Basket'],q2:'25-34',q3:'Homme',q4:'Visiteur',q5:'Lille',q6:'Instagram',q7:'2 ans',q8:'2h',q12:'Seul',q13:{Accueil:'Très bien'},q14:'Trop de monde',q15:'Bonne ambiance',q16:8,q20:'Commentaire général'}};
 const rows=[
  {...base,answers:{...base.answers,q9:'Oui',q10:['Box'],q11:'100 à 150 €',q17:'Oui',q18:'Oui',q19:'10 €'}},
  {...base,answers:{...base.answers,q9:'Non',q17:'Non'}}
 ];
 const stats=visitorStats(rows,questions);
 assert.equal(stats.topPurchase,'Box');
 assert.equal(stats.averageSpend,125);
 assert.deepEqual(stats.distributions.didPurchase,[['Non',1],['Oui',1]]);
 assert.deepEqual(stats.distributions.companions,[['Seul',2]]);
 assert.deepEqual(stats.distributions.returnIntent,[['Non',1],['Oui',1]]);
 assert.equal(stats.averageEntryPrice,10);
 const html=visitorFeedbackMarkup(rows,questions);
 assert.match(html,/Q20 · Retours libres/);
 assert.match(html,/Commentaire général/);
 assert.match(html,/Q15 · Points positifs/);
 assert.match(html,/Bonne ambiance/);
 assert.match(html,/Q14 · Points négatifs/);
 assert.match(html,/Trop de monde/);
 assert.doesNotMatch(html,/Seul : 1/);
});
