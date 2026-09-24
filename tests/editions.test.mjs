import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountEditions} from '../src/editions.js';
test('sélecteur annuel, blocage pendant une saisie et ajout sans doublon',async()=>{
 const dom=new JSDOM('<div id="picker"></div>');globalThis.document=dom.window.document;
 const selected=[],created=[];let leave=false;
 mountEditions({host:document.getElementById('picker'),years:[2026,2027],selected:2026,canCreate:true,onSelect:y=>selected.push(y),onCreate:async y=>created.push(y),canLeave:()=>leave});
 assert.match(document.querySelector('summary').textContent,/2026/);document.querySelector('.edition-option').click();assert.equal(selected.length,0);leave=true;document.querySelector('.edition-option').click();assert.deepEqual(selected,[2027]);
 const form=document.querySelector('form'),input=form.querySelector('input');input.value='2026';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(created.length,0);assert.match(form.textContent,/existe déjà/);
 input.value='2028';form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.deepEqual(created,[2028]);
 mountEditions({host:document.getElementById('picker'),years:[2026],selected:2026,canCreate:false,onSelect:()=>{}});assert.equal(document.querySelector('form'),null);dom.window.close();
});
