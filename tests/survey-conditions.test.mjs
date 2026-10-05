import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createEditor,renderSurveyEditor,validateEditorConditions} from '../src/survey-editor.js';
import {activeQuestions,pruneInactiveAnswers,validateAnswers} from '../src/survey-schema.js';

test('éditeur : une réponse Oui révèle une sous-question configurable',async()=>{
 const dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.getElementById('root');
 const state=createEditor('visiteur',{questions:[{key:'visit',label:'As-tu acheté ?',kind:'choice',options:['Oui','Non'],required:true},{key:'thanks',label:'Merci',kind:'text'}]});
 let saved=false;
 renderSurveyEditor(root,state,{onSave:async()=>{saved=true},onClose:()=>{}});
 root.querySelector('[data-survey-add-child="0"]').click();
 assert.deepEqual(state.items[1].showIf,{key:'visit',equals:'Oui'});
 assert.match(root.textContent,/Question avec condition/);
 assert.match(root.textContent,/Réponse attendue/);
 root.querySelector('[data-survey-save]').click();
 await Promise.resolve();assert.equal(saved,true);
 assert.equal(validateEditorConditions(state.items),'');
 const no={visit:'Non',thanks:'Autre réponse'};
 pruneInactiveAnswers('visiteur',no,state.items);
 assert.deepEqual(no,{visit:'Non',thanks:'Autre réponse'});
 assert.deepEqual(activeQuestions('visiteur',no,state.items).map(q=>q.key),['visit','thanks']);
 const yes={visit:'Oui',[state.items[1].key]:'Des cartes'};
 assert.ok(validateAnswers('visiteur',yes,state.items));
 const changed={visit:'Non',[state.items[1].key]:'Des cartes'};
 pruneInactiveAnswers('visiteur',changed,state.items);
 assert.ok(validateAnswers('visiteur',changed,state.items));
 const value=root.querySelector('[data-survey-condition-value="1"]');
 value.value='Non';value.dispatchEvent(new dom.window.Event('change'));
 assert.equal(state.items[1].showIf.equals,'Non');
 dom.window.close();
});

test('éditeur : refuse une condition orpheline ou une réponse supprimée',()=>{
 const items=[{key:'trigger',kind:'dropdown',options:['Oui','Non']},{key:'follow',kind:'text',showIf:{key:'trigger',equals:'Oui'}}];
 assert.equal(validateEditorConditions(items),'');
 items[0].options=['Non'];assert.match(validateEditorConditions(items),/Vérifie la condition/);
 items[0].options=['Oui','Non'];items.reverse();assert.match(validateEditorConditions(items),/Vérifie la condition/);
});
