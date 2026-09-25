import test from 'node:test';
import assert from 'node:assert/strict';
import {animationLayout,validAnimation} from '../src/animations.js';
test('créneaux 8 h–20 h et événements simultanés visibles',()=>{
 assert.ok(validAnimation('08:00','20:00'));
 for(const pair of [['07:59','09:00'],['10:00','10:00'],['19:30','20:15'],['12:60','13:00']])assert.equal(validAnimation(...pair),false);
 const rows=animationLayout([{id:'first',start:'09:00',end:'10:30'},{id:'second',start:'10:00',end:'11:00'},{id:'third',start:'11:00',end:'12:00'}]);
 assert.equal(rows.length,3);assert.deepEqual(rows.slice(0,2).map(r=>r.lane),[0,1]);assert.ok(rows.slice(0,2).every(r=>r.columns===2));assert.equal(rows[2].lane,0);
});
