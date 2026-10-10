import {participationTotals,partnerRevenue,engagedPartner} from './participation.js';
export const defaultCategories=[{id:'expense-invoices',side:'expense',title:'Factures payées'},{id:'expense-hall',side:'expense',title:'Location de salle'},{id:'expense-other',side:'expense',title:'Autres dépenses'},{id:'sale-tickets',side:'sale',title:'Billetterie'},{id:'sale-tables',side:'sale',title:'Tables / Stands'},{id:'sale-partners',side:'sale',title:'Partenaires'},{id:'sale-other',side:'sale',title:'Ventes'}];
export const cents=value=>Math.round((Number(String(value??0).replace(',','.'))||0)*100);
export const hallRentalAmount=db=>Math.max(0,Number(db.settings?.hallRental??db.forecast2027?.hallRental)||0);
export function bilanData(db){
 const categories=[...defaultCategories,...(db.ledger_categories||[])];
 const assignments=new Map((db.ledger_entries||[]).filter(x=>x.sourceId).map(x=>[x.sourceId,x]));
 const rows=(db.ledger_entries||[]).filter(x=>!x.sourceId).map(x=>({...x,amountCents:Math.max(0,Number(x.amountCents)||0)}));
 for(const invoice of db.invoices||[]){if(invoice.tag!=='Facture'||invoice.status!=='Payé')continue;const a=assignments.get(invoice.id),side=invoice.direction==='Recette'?'sale':'expense';rows.push({id:'invoice:'+invoice.id,sourceId:invoice.id,title:invoice.title||invoice.fileName||'Facture',side,categoryId:a?.categoryId||(side==='sale'?'sale-other':'expense-invoices'),amountCents:cents(invoice.amount),order:a?.order??0});}
 const derived=(sourceId,title,side,categoryId,amount,sourceKind)=>{const amountCents=cents(amount),a=assignments.get(sourceId);if(amountCents>0&&!a?.excluded)rows.push({id:'auto:'+sourceId,sourceId,title,side,categoryId:a?.categoryId||categoryId,amountCents,order:a?.order??0,sourceKind});};
 derived('hall-rental','Location de salle','expense','expense-hall',hallRentalAmount(db),'hall');
 for(const [key,label] of [['general','Entrée'],['vip','Pack VIP'],['early','Early access']])derived('ticket:'+key,label+' · volume estimé','sale','sale-tickets',(Number(db.settings?.[key+'Price'])||0)*(Number(db.settings?.[key+'Quantity'])||0),'ticket');
 const participation=participationTotals(db);
 derived('exhibitors-total','Tables / Stands','sale','sale-tables',participation.exhibitors,'exhibitors-total');
 const receivedByPartner=new Map();for(const i of db.invoices||[])if(i.tag==='Facture'&&i.status==='Payé'&&i.direction==='Recette'&&i.partnerId)receivedByPartner.set(i.partnerId,(receivedByPartner.get(i.partnerId)||0)+cents(i.amount));
 const credited=(db.partners||[]).filter(engagedPartner).reduce((sum,p)=>sum+Math.min(Math.max(0,cents(partnerRevenue(p,db.settings))),receivedByPartner.get(p.id)||0),0)/100;
 derived('partners-total','Partenaires','sale','sale-partners',Math.max(0,participation.partners-credited),'partners-total');
 for(const row of rows)if(!categories.some(c=>c.id===row.categoryId&&c.side===row.side))row.categoryId=row.side==='sale'?'sale-other':'expense-other';
 rows.sort((a,b)=>(a.order||0)-(b.order||0)||a.id.localeCompare(b.id));
 const expenses=rows.filter(x=>x.side==='expense').reduce((n,x)=>n+x.amountCents,0),sales=rows.filter(x=>x.side==='sale').reduce((n,x)=>n+x.amountCents,0),delta=sales-expenses,opening=cents(db.settings?.ncBalance);
 return {categories,rows,expenses,sales,delta,opening,balance:opening+delta};
}
export function moveBilanRow(db,rowId,categoryId){
 const data=bilanData(db),row=data.rows.find(x=>x.id===rowId),category=data.categories.find(x=>x.id===categoryId);
 if(!row||!category||category.side!==row.side)return false;
 let stored=db.ledger_entries.find(x=>x.id===row.id);
 if(!stored){stored={id:row.id,sourceId:row.sourceId,side:row.side};db.ledger_entries.push(stored);}
 stored.categoryId=categoryId;stored.order=Math.max(0,...data.rows.map(x=>Number(x.order)||0))+1;return true;
}
