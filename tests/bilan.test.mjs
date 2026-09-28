import test from 'node:test';
import assert from 'node:assert/strict';
import {bilanData,moveBilanRow} from '../src/bilan.js';
test('bilan : factures payées uniques, centimes, BFR et reclassement',()=>{
 const db={settings:{ncBalance:100},ledger_categories:[{id:'comm',side:'expense',title:'Communication'}],ledger_entries:[{id:'sale',title:'Billets',side:'sale',amountCents:30000,categoryId:'sale-other'}],invoices:[{id:'paid',tag:'Facture',status:'Payé',amount:100.15},{id:'quote',tag:'Devis',status:'Payé',amount:1000},{id:'unpaid',tag:'Facture',status:'Non payé',amount:2000}]};
 let data=bilanData(db);assert.equal(data.expenses,10015);assert.equal(data.sales,30000);assert.equal(data.delta,19985);assert.equal(data.balance,29985);
 assert.ok(moveBilanRow(db,'invoice:paid','comm'));assert.ok(moveBilanRow(db,'invoice:paid','comm'));
 data=bilanData(db);assert.equal(data.rows.length,2);assert.equal(db.ledger_entries.length,2);assert.equal(data.rows.find(x=>x.sourceId).categoryId,'comm');
 assert.equal(moveBilanRow(db,'invoice:paid','sale-other'),false);
 db.invoices[0].amount=120.25;assert.equal(bilanData(db).expenses,12025);
 db.invoices[0].status='Non payé';assert.equal(bilanData(db).expenses,0);
});
test('bilan : location, billets estimés et partenaires terminés suivent leurs sources',()=>{
 const db={settings:{ncBalance:50,generalPrice:12,generalQuantity:100,vipPrice:30,vipQuantity:2,partnerTablePrice:250,partnerSqmPrice:60},forecast2027:{hallRental:900},ledger_categories:[],ledger_entries:[],invoices:[],partners:[{id:'done',company:'Studio',status:'Terminé',unit:'Table',quantity:2},{id:'waiting',company:'Autre',status:'En discussion',quantity:4},{id:'forced',status:'Terminé',amountForced:true,amount:150,unit:'m²',quantity:20}]};
 let data=bilanData(db);
 assert.equal(data.expenses,90000);assert.equal(data.sales,191000);assert.equal(data.balance,106000);
 assert.equal(data.rows.filter(x=>x.sourceKind==='partner').length,2);
 assert.ok(moveBilanRow(db,'auto:partner:done','sale-other'));
 assert.equal(bilanData(db).rows.find(x=>x.sourceId==='partner:done').categoryId,'sale-other');
 db.partners[0].status='En discussion';db.settings.generalQuantity=80;
 data=bilanData(db);assert.equal(data.sales,117000);assert.equal(data.rows.filter(x=>x.sourceKind==='partner').length,1);
 assert.equal(bilanData(db).rows.length,data.rows.length);
});
