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

 const ledger=api.getState();ledger.ledger_entries=[];ledger.ledger_categories=[];ledger.invoices=[{id:'f',title:'Facture test',tag:'Facture',status:'Payé',amount:20},{id:'d',title:'Devis test',tag:'Devis',status:'Non payé',amount:30}];api.replaceState(ledger);
 document.querySelector('[data-view="bilan"]').click();document.querySelector('[data-bilan-category="sale"]').click();
 let b=document.getElementById('bilanCategoryForm');b.elements.title.value='Billetterie';b.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(api.getState().ledger_categories[0].title,'Billetterie');
 document.querySelector('[data-bilan-add="sale"]').click();b=document.getElementById('bilanLineForm');b.elements.title.value='VIP';b.elements.amount.value='100.25';b.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(api.getState().ledger_entries[0].amountCents,10025);
 let select=document.querySelector('[data-bilan-move]');select=document.querySelector('[data-bilan-move="'+api.getState().ledger_entries[0].id+'"]');select.value=api.getState().ledger_categories[0].id;select.dispatchEvent(new Event('change',{bubbles:true}));
 assert.equal(api.getState().ledger_entries[0].categoryId,api.getState().ledger_categories[0].id);
 b=document.getElementById('ncAccountForm');b.elements.amount.value='500';b.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));assert.equal(api.getState().settings.ncBalance,500);
 document.querySelector('[data-view="invoices"]').click();assert.match(document.querySelector('tbody').textContent,/Facture test/);assert.doesNotMatch(document.querySelector('tbody').textContent,/Devis test/);
 document.querySelector('[data-invoice-tab="Devis"]').click();assert.match(document.querySelector('tbody').textContent,/Devis test/);
 document.querySelector('[data-add="invoices"]').click();assert.equal(document.getElementById('editForm').elements.tag.value,'Devis');
 dom.window.close();
});
