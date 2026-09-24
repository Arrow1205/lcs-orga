import test from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotSync} from '../src/sync.js';
import {decodeMigration,referencedFiles} from '../src/migration.js';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('écritures séquentielles, dernière modification conservée',async()=>{
 let finish,calls=[];const sync=new SnapshotSync({revision:4,write:async(rev,data)=>{calls.push([rev,data]);if(calls.length===1)await new Promise(r=>finish=r);return rev+1;}});
 sync.enqueue({n:1});sync.enqueue({n:2});sync.enqueue({n:3});finish();await tick();
 assert.deepEqual(calls,[[4,{n:1}],[5,{n:3}]]);assert.equal(sync.revision,6);assert.equal(sync.dirty,false);
});
test('conflit ne réessaie pas et garde la copie locale',async()=>{
 let recovery,calls=0;const sync=new SnapshotSync({revision:1,write:async()=>{calls++;throw {code:'40001'};},onError:(e,data)=>recovery=data});
 sync.enqueue({n:1});await tick();sync.enqueue({n:2});await tick();assert.equal(calls,1);assert.equal(sync.blocked,true);assert.deepEqual(sync.latest,{n:2});assert.deepEqual(recovery,{n:1});
});
const state={schema:1,exhibitors:[],contacts:[],tasks:[],posts:[],expenses:[],zones:[],assets:[{blobId:'one'}]};
test('migration détecte fichier absent',async()=>{await assert.rejects(decodeMigration({format:'lcs-migration',version:1,state,files:[]}),/absente/);});
test('migration vérifie SHA-256 et reconstitue la pièce jointe',async()=>{
 const blob=new TextEncoder().encode('test');const hash=Buffer.from(await crypto.subtle.digest('SHA-256',blob)).toString('hex');
 const pack={format:'lcs-migration',version:1,state,files:[{id:'one',type:'text/plain',base64:Buffer.from(blob).toString('base64'),sha256:hash}]};
 const result=await decodeMigration(pack);assert.equal(await result.files.get('one').text(),'test');assert.deepEqual(referencedFiles(state),['one']);
 pack.files[0].sha256='wrong';await assert.rejects(decodeMigration(pack),/Intégrité/);
});
