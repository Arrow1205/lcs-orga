import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {startCRM} from '../src/crm.js';
import {importMapping,exhibitorAmount,vendorType,tableCount} from '../src/exhibitor-import.js';

test('colonnes du CSV, types et montants communs à la saisie et à l’import',()=>{
 const m=importMapping(['Nbre TABLES ?','Type','Nom','Prénom','eMail','Communauté','Société','Tu es un(e)','Ville','Téléphone']);
 assert.equal(m.vendorType,1);assert.equal(m.email,4);assert.equal(m.phone,9);assert.equal(m.tables,0);
 assert.equal(vendorType('PRO'),'Pro');assert.equal(vendorType('Particulier'),'Collectionneur');assert.equal(vendorType('Artiste'),'Artiste');
 const settings={proTablePrice:50,collectorTablePrice:35,artistTablePrice:25,partnerTablePrice:100};
 assert.equal(exhibitorAmount('Pro',2,settings),100);assert.equal(exhibitorAmount('Collectionneur','',settings),35);
 assert.equal(exhibitorAmount('Artiste',2,settings),50);assert.equal(exhibitorAmount('Partenaire',5,settings),1500);
 assert.equal(exhibitorAmount('Partenaire',5,{exhibitorPartnerPrice:1800}),1800);
 assert.equal(tableCount(-2),1);assert.equal(tableCount(1.5),1);
});

test('import sans billet, reimport sans doublon, prix du Salon et saisie manuelle',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://crm.test/exposants?year=2026'});
 const alerts=[];Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,Event:dom.window.Event,scrollTo:()=>{},alert:text=>alerts.push(text),confirm:()=>true});
 const api=startCRM(null,{role:'admin',save:()=>{}});const state=api.getState();Object.assign(state.settings,{proTablePrice:50,collectorTablePrice:35,artistTablePrice:25});api.replaceState(state);
 async function upload(text){
  document.querySelector('[data-action="import-csv"]').click();
  const file={name:'exposants.csv',arrayBuffer:async()=>new TextEncoder().encode(text).buffer};
  const input=document.getElementById('csvFile');Object.defineProperty(input,'files',{value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));
 }
 const csv='Nbre TABLES ?,Type,Nom,Prénom,eMail,Communauté,Société,Tu es un(e),Ville,Téléphone\n2,PRO,Martin,Alex,alex@example.test,Basket,Shop,Particulier,Lille,0612345678\n,Collectionneur,Petit,Camille,camille@example.test,TCG,Pseudo,Particulier,Lille,0698765432\n3,Partenaire,Durand,Sam,sam@example.test,Football,Partner,,,\n2,Artiste,Art,Ana,ana@example.test,Sport US,Atelier,,,\n';
 await upload(csv.replace(',Collectionneur,Petit',',,Petit').replace('Téléphone\n','Téléphone,Zone affectée\n').replace('0612345678\n','0612345678,Football\n'));assert.equal(document.querySelector('[data-map="vendorType"]').value,'1');assert.equal(document.getElementById('tableOnly').checked,false);assert.equal(document.querySelector('[data-map="order"]'),null);assert.equal(document.querySelector('[data-map="ticket"]'),null);assert.ok(document.querySelector('[data-map="zone"]'));document.querySelector('[data-action="commit-csv"]').click();
 let rows=api.getState().exhibitors;assert.equal(rows.length,4);assert.equal(rows[0].status,'Confirmé');assert.equal(rows[0].zone,'soccer');assert.equal(rows[0].phone,'0612345678');assert.equal(rows[0].vendorType,'Pro');assert.equal(rows[0].tables,2);assert.equal(rows[0].amount,100);assert.equal(rows[1].tables,1);assert.equal(rows[1].company,'Pseudo');assert.equal(rows[1].amount,35);assert.equal(rows[2].amount,1500);assert.equal(rows[3].amount,50);
 // Une correction de tarif est conservée, ainsi que l'attribution et les commentaires.
 const remote=api.getState();remote.exhibitors[0].amount=123;remote.exhibitors[0].amountEdited=true;remote.exhibitors[0].zone='basket';remote.exhibitors[0].comments=[{text:'Suivi'}];api.replaceState(remote);
 await upload(csv);document.querySelector('[data-action="commit-csv"]').click();rows=api.getState().exhibitors;assert.equal(rows.length,4);assert.equal(rows[0].amount,123);assert.equal(rows[0].zone,'basket');assert.equal(rows[0].comments.length,1);
 document.querySelector('[data-add="exhibitors"]').click();const form=document.getElementById('editForm');assert.equal(form.elements.vendorType.value,'Collectionneur');assert.equal(form.elements.tables.value,'1');assert.equal(form.elements.amount.value,'35');assert.match(form.textContent,/Société \/ pseudo/);assert.match(form.elements.vendorType.textContent,/Particulier/);
 form.elements.vendorType.value='Partenaire';form.elements.vendorType.dispatchEvent(new Event('change',{bubbles:true}));form.elements.tables.value='4';form.elements.tables.dispatchEvent(new Event('input',{bubbles:true}));assert.equal(form.elements.amount.value,'1500');form.elements.last.value='Autre';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));assert.equal(api.getState().exhibitors.at(-1).amount,1500);assert.equal(api.getState().exhibitors.at(-1).tables,4);
 // HelloAsso reste compatible et exclut les billets de repas.
 await upload('Numéro de billet;Nom;Prénom;Email participant;Tarif;Montant tarif;Téléphone;Quantité\nB1;Billet;Jean;jean@example.test;Table Pro;999;0600000000;2\nB2;Repas;Lou;lou@example.test;Repas;15;;1');
 assert.equal(document.getElementById('tableOnly').checked,true);document.querySelector('[data-action="commit-csv"]').click();const ha=api.getState().exhibitors.find(x=>x.ticket==='B1');assert.equal(ha.amount,100);assert.equal(ha.sourceAmount,'999');assert.equal(ha.tables,2);assert.equal(api.getState().exhibitors.some(x=>x.ticket==='B2'),false);
 // Les identités ambiguës sont laissées à corriger, jamais fusionnées arbitrairement.
 const before=api.getState().exhibitors.length;await upload('Type,Nom,Prénom\nPro,Dup,Alex\nPro,Dup,Alex');document.querySelector('[data-action="commit-csv"]').click();assert.equal(api.getState().exhibitors.length,before);assert.equal(alerts.length,0);
 dom.window.close();
});
