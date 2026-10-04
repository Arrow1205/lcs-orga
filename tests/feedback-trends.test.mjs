import test from 'node:test';
import assert from 'node:assert/strict';
import {groupComments,themesFor} from '../src/feedback-themes.js';
import {visitorFeedbackMarkup} from '../src/visitor-feedback.js';

test('les formulations proches forment une tendance et les doublons gardent leur volume',()=>{
 const praise=groupComments(['Ne changez rien !','Vous êtes parfaits','ne changez rien'], 'highlights');
 assert.equal(praise.find(g=>g.name==='Éloges').count,3);
 assert.equal(praise.find(g=>g.name==='Éloges').quotes.find(q=>q.text==='Ne changez rien !').count,2);
 const crowd=groupComments(['Trop de monde','Les allées étaient impraticables à cause de la foule'],'improvements');
 assert.equal(crowd.find(g=>g.name==='Forte affluence').count,2);
 assert.deepEqual(themesFor('Avis inédit sans mots clés'),['Autres retours']);
});

test('quatre camemberts lisibles et tendances vérifiables dans la vue visiteurs',()=>{
 const questions=[{key:'age',label:'Quelle est ta tranche d’âge ?'},{key:'gender',label:'Quel est ton genre ?'}];
 const rows=[{type:'visiteur',questions,answers:{community:['Basket','Soccer'],age:'25-34',gender:'Femme',returnIntent:'Oui',highlights:'Ne changez rien',improvements:'Trop de monde'}},{type:'visiteur',questions,answers:{community:['Basket'],age:'35-44',gender:'Homme',returnIntent:'Non',highlights:'Vous êtes parfaits',improvements:'Les allées impraticables'}}];
 const html=visitorFeedbackMarkup(rows);
 assert.equal((html.match(/class="visitor-pie"/g)||[]).length,4);
 assert.match(html,/Communautés : Basket : 2, Soccer : 1/);
 assert.match(html,/Les pourcentages indiquent la part des répondants/);
 assert.match(html,/Éloges/);
 assert.match(html,/Forte affluence/);
 assert.match(html,/Ne changez rien/);
});
