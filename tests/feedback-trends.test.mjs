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
 assert.equal((html.match(/class="visitor-pie"/g)||[]).length,6);
 assert.match(html,/Communautés : Basket : 2, Soccer : 1/);
 assert.match(html,/Les pourcentages indiquent la part des répondants/);
 assert.match(html,/Types d’achat : Cartes : 2, Goodies : 1/);
 assert.match(html,/Prêt à payer l’entrée l’an prochain : Non : 1, Oui : 1/);
 assert.match(html,/Prix moyen entrée 2027/);
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
