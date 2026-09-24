import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordSync,diffRecords} from '../src/records.js';
const state=()=>({schema:1,settings:{},forecast2027:{},tasks:[{id:'a',title:'A'},{id:'b',title:'B'}]});
const tick=()=>new Promise(r=>setTimeout(r,0));
test('seule la fiche modifiée est envoyée ; updatedAt ignoré',()=>{const before=state(),after=state();after.tasks[0].title='AA';after.updatedAt='today';const changes=diffRecords(before,after);assert.equal(changes.length,1);assert.equal(changes[0].id,'a');});
test('une suppression est explicite et conserve sa version avant',()=>{const before=state(),after=state();after.tasks.pop();assert.deepEqual(diffRecords(before,after),[{entity:'tasks',id:'b',before:{id:'b',title:'B'},after:null}]);});
test('réessai réseau avec le même UUID même si le lot suivant évolue',async()=>{
 const calls=[];let fail=true;const sync=new RecordSync({initial:{data:state(),revision:1},write:async(id,changes)=>{calls.push({id,changes});if(fail){fail=false;throw Error('network');}return calls.length;}});
 const first=state();first.tasks[0].title='AA';sync.enqueue(first);await tick();const next=structuredClone(first);next.tasks[1].title='BB';sync.enqueue(next);sync.retry();await tick();
 // Le lot incertain est confirmé avant le lot suivant.
 assert.equal(calls[0].id,calls[1].id);assert.deepEqual(calls[0].changes,calls[1].changes);
 assert.equal(sync.dirty,false);
 assert.equal(sync.base.tasks[1].title,'BB');
});
test('une réponse tardive ne remplace pas une saisie en cours',async()=>{let done;const sync=new RecordSync({initial:{data:state(),revision:1},write:()=>new Promise(r=>done=r)});const next=state();next.tasks[0].title='AA';sync.enqueue(next);assert.equal(sync.accept({data:state(),revision:10}),false);done(2);await tick();assert.equal(sync.base.tasks[0].title,'AA');});
