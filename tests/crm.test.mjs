import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {startCRM} from '../src/crm.js';
test('la V1 en ligne sauvegarde vers le backend et affiche les pièces jointes distantes',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{url:'https://crm.test/'});
 const saved=[];
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,Event:dom.window.Event,scrollTo:()=>{},alert:()=>{},confirm:()=>true});
 const api=startCRM(null,{save:state=>saved.push(structuredClone(state)),putBlob:async()=>{},getBlob:async()=>new Blob(['test'],{type:'text/plain'})});
 document.querySelector('[data-view="tasks"]').click();
 document.querySelector('[data-add="tasks"]').click();
 const form=document.getElementById('editForm');form.elements.title.value='Test cloud';
 form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(r=>setTimeout(r,0));
 assert.equal(saved.length,1);assert.equal(saved[0].tasks[0].title,'Test cloud');assert.equal(api.getState().tasks.length,1);
 assert.equal(dom.window.localStorage.getItem('lcs-crm-v1'),null);
 const remote=api.getState();remote.tasks[0].title='Autre membre';api.replaceState(remote);assert.match(document.getElementById('content').textContent,/Autre membre/);

 const state=api.getState();state.contacts=[{id:'c1',type:'Partenaire',company:'Test Société',first:'Alex',last:'Martin',email:'alex@example.test',phone:'0123456789'}];api.replaceState(state);
 document.querySelector('[data-view="partners"]').click();document.querySelector('[data-add="partners"]').click();
 const partner=document.getElementById('editForm');partner.elements.company.value='Test Société';partner.elements.company.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.equal(partner.elements.name.value,'Alex Martin');assert.equal(partner.elements.email.value,'alex@example.test');assert.equal(partner.elements.phone.value,'0123456789');assert.ok(!partner.textContent.includes('Annuler'));
 document.querySelector('.close').click();document.querySelector('[data-view="posts"]').click();document.querySelector('[data-add="posts"]').click();
 const post=document.getElementById('editForm');for(const group of ['Presse','Web','RS']){post.elements.group.value=group;post.elements.group.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(post.elements.channel.disabled,group!=='RS');assert.equal(post.querySelector('[data-field="channel"]').hidden,group!=='RS')}
 document.querySelector('.close').click();document.getElementById('mobileToggle').click();assert.equal(document.getElementById('mobileToggle').getAttribute('aria-expanded'),'true');document.querySelector('#mobileNav [data-view="ideas"]').click();assert.equal(document.getElementById('mobileToggle').getAttribute('aria-expanded'),'false');
 dom.window.close();
});
