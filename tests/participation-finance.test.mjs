import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {exhibitorRevenue,participationTotals,implantation} from '../src/participation.js';
import {bilanData,moveBilanRow} from '../src/bilan.js';
import {startCRM} from '../src/crm.js';
const financialState=()=>({settings:{proTablePrice:50,collectorTablePrice:30,exhibitorPartnerPrice:1500,partnerTablePrice:100,ncBalance:500},exhibitors:[{id:'pro',name:'Pro',community:'Basket',vendorType:'Pro',tables:3,amount:0,status:'Confirmé'},{id:'collector',name:'Collectionneur',community:'TCG',vendorType:'Collectionneur',tables:2,amount:60,amountEdited:false,status:'Confirmé'},{id:'manual',name:'Manuel',community:'Basket',vendorType:'Pro',tables:1,amount:12.5,amountEdited:true,status:'Confirmé'},{id:'cancelled',vendorType:'Pro',tables:20,amount:1000,status:'Annulé'}],partners:[{id:'partner',company:'Stand',status:'Accord',quantity:2,unit:'Table'},{id:'prospect',status:'En discussion',quantity:10},{id:'refused',status:'Refusé',quantity:20}],ledger_entries:[{id:'manual-sale',title:'Autre recette',side:'sale',amountCents:1500,categoryId:'sale-other'}],ledger_categories:[],invoices:[{id:'invoice',tag:'Facture',status:'Payé',amount:80},{id:'quote',tag:'Devis',status:'Payé',amount:1000}]});
test('recettes automatiques, corrections manuelles, centimes et rubrique tables/stands',()=>{
 const db=financialState();assert.deepEqual(participationTotals(db),{tables:6,exhibitors:222.5,partners:200});
 assert.equal(exhibitorRevenue({vendorType:'Pro',tables:3,amount:125},db.settings),125); // ancien montant conservé
 let data=bilanData(db);assert.equal(data.sales,43750);assert.equal(data.expenses,8000);assert.equal(data.delta,35750);assert.equal(data.balance,85750);
 assert.equal(data.rows.filter(x=>x.categoryId==='sale-tables').length,1);
 assert.equal(data.rows.filter(x=>x.sourceId==='partners-total').length,1);
 assert.equal(data.rows.some(x=>x.sourceId==='exhibitor:cancelled'),false);
 db.settings.proTablePrice=70;db.settings.collectorTablePrice=40;
 data=bilanData(db);assert.equal(data.sales,51750);assert.equal(data.rows.find(x=>x.sourceId==='exhibitors-total').amountCents,30250);
 assert.ok(moveBilanRow(db,'auto:exhibitors-total','sale-other'));assert.equal(bilanData(db).sales,51750);
 db.partners[0].status='Refusé';assert.equal(bilanData(db).sales,31750);
});
test('vue d’ensemble, bilan et totaux affichent les mêmes calculs après un changement de tarif',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://crm.test/vue-ensemble?year=2026'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,Event:dom.window.Event,scrollTo:()=>{},alert:()=>{},confirm:()=>true});
 const api=startCRM(null,{role:'admin',save:()=>{}});const initial=api.getState(),finance=financialState();api.replaceState({...initial,...finance,settings:{...initial.settings,...finance.settings}});
 const text=selector=>document.querySelector(selector).textContent.replace(/[\s\u202f\u00a0]/g,'');
 assert.match(text('.finance-card.income strong'),/437,50/);assert.equal(document.querySelector('.overview-attendance > :last-child .eyebrow').textContent,'PARTENAIRES');assert.match(text('.zone-donut-card'),/13%.*4\/30tables.*0affectées.*4àaffecter/);assert.match(text('.finance-card.expense strong'),/80,00/);assert.match(text('.finance-card.balance strong'),/357,50/);
 document.querySelector('[data-view="bilan"]').click();assert.match(text('.bilan-totals > :nth-child(2)'),/437,50/);assert.ok(document.querySelector('[data-drop-category="sale-tables"]'));assert.match(text('[data-drop-category="sale-partners"]'),/200,00/);assert.match(text('[data-drop-category="sale-tables"]'),/222,50/);assert.equal(document.querySelectorAll('[data-drop-category="sale-tables"] .bilan-row').length,1);
 document.querySelector('[data-view="exhibitors"]').click();assert.match(text('.participation-summary'),/6.*222,50/);assert.match(text('.exhibitor-zone-kpi'),/4tables.*162,50/); // communauté Basket, sans zone attribuée
 document.querySelector('[data-view="partners"]').click();assert.match(text('.participation-summary'),/200,00/);
 document.querySelector('[data-view="salon"]').click();const price=document.querySelector('[data-salon-number="proTablePrice"]');price.value='70';price.dispatchEvent(new Event('change',{bubbles:true}));
 document.querySelector('[data-view="dashboard"]').click();assert.match(text('.finance-card.income strong'),/497,50/);
 document.querySelector('[data-action="finance-detail"]').click();assert.match(text('.modal-body'),/497,50/);assert.doesNotMatch(text('.modal-body'),/Devis/);document.querySelector('.close').click();
 document.querySelector('[data-view="exhibitors"]').click();document.querySelector('[data-exhibitor-tab="partners"]').click();assert.match(text('.participation-summary'),/200,00/);
 dom.window.close();
});

test('implantation : zone prioritaire, communautés sans zone, annulations et cas sans capacité',()=>{
 const db={zones:[{id:'basket',name:'Basket',capacity:30},{id:'soccer',name:'Soccer',capacity:0},{id:'sports-us',name:'Sports US',capacity:10}],exhibitors:[{zone:'Football',community:'Basket',tables:2},{community:'Basket',tables:3},{zone:'SPORTS US',tables:1},{community:'Sports US',tables:2},{zone:'basket',tables:8,status:'Annulé'},{community:'Autre',tables:4}]};
 const result=implantation(db);assert.equal(result.zones[0].total,3);assert.equal(result.zones[0].pending,3);assert.equal(result.zones[1].assigned,2);assert.equal(result.zones[1].pending,0);assert.equal(result.zones[2].assigned,1);assert.equal(result.zones[2].pending,2);assert.equal(result.unclassified,4);
});
test('les anciens reclassements détaillés ne doublent pas les deux totaux regroupés',()=>{
 const db=financialState();db.ledger_entries.push({id:'auto:exhibitor:pro',sourceId:'exhibitor:pro',side:'sale',categoryId:'sale-other'},{id:'auto:partner:partner',sourceId:'partner:partner',side:'sale',categoryId:'sale-other'});
 const data=bilanData(db);assert.equal(data.sales,43750);assert.equal(data.rows.filter(r=>r.sourceKind==='exhibitors-total').length,1);assert.equal(data.rows.filter(r=>r.sourceKind==='partners-total').length,1);assert.equal(db.ledger_entries.length,3);
});
