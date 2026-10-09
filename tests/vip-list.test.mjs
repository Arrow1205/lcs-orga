import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVIPFile} from '../src/vip-list.js';
import * as XLSX from 'xlsx';
const headers=['Nom participant','Prénom participant','Email payeur','Es-tu déjà venu au Lille Card Show ?','Quelles cartes vas-tu chercher en priorité sur le salon ?','Numéro de billet','Tarif'];
const values=[headers,['Dupont','Éloïse','parent@example.test','Oui','Basket, TCG','001','Pack VIP'],['Dupont','Éloïse','parent@example.test','Non','Soccer','002','Early Access']];
test('imports XLSX/XLS/CSV : mêmes champs, accents, catégorie et identifiant stable',async()=>{
 let expected;
 for(const bookType of ['xlsx','xls','csv']){const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(values),'Participants');const buf=XLSX.write(wb,{type:'buffer',bookType});const rows=await parseVIPFile(buf,'listing.'+bookType,'VIP');assert.equal(rows.length,2);assert.equal(rows[0].email,'parent@example.test');assert.equal(rows[0].first,'Éloïse');assert.equal(rows[0].priority,'Basket, TCG');assert.equal(rows[1].kind,'Early Access');assert.notEqual(rows[0].sourceKey,rows[1].sourceKey);if(expected)assert.deepEqual(rows,expected);expected=rows;assert.deepEqual(await parseVIPFile(buf,'listing.'+bookType,'VIP'),rows)}
 await assert.rejects(parseVIPFile(new TextEncoder().encode('Nom participant;Prénom participant\nJean;Dupont'),'missing.csv'),/Colonnes manquantes/);
});
test('CSV séparateur point-virgule, cellules entre guillemets et doublons sans billet',async()=>{
 const text=headers.slice(0,5).join(';')+'\nDupont;Jean;a@example.test;Oui;"Basket; TCG"\nDupont;Jean;a@example.test;Oui;"Basket; TCG"';const rows=await parseVIPFile(new TextEncoder().encode(text),'EARLY.csv','Early Access');assert.equal(rows[0].priority,'Basket; TCG');assert.equal(rows[0].kind,'Early Access');assert.notEqual(rows[0].sourceKey,rows[1].sourceKey);
});
