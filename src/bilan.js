export const defaultCategories=[{id:'expense-invoices',side:'expense',title:'Factures payées'},{id:'expense-other',side:'expense',title:'Autres dépenses'},{id:'sale-other',side:'sale',title:'Ventes'}];
export const cents=value=>Math.round((Number(String(value??0).replace(',','.'))||0)*100);
export function bilanData(db){
 const categories=[...defaultCategories,...(db.ledger_categories||[])];
 const assignments=new Map((db.ledger_entries||[]).filter(x=>x.sourceId).map(x=>[x.sourceId,x]));
 const rows=(db.ledger_entries||[]).filter(x=>!x.sourceId).map(x=>({...x,amountCents:Math.max(0,Number(x.amountCents)||0)}));
 for(const invoice of db.invoices||[]){if(invoice.tag!=='Facture'||invoice.status!=='Payé')continue;const a=assignments.get(invoice.id);rows.push({id:'invoice:'+invoice.id,sourceId:invoice.id,title:invoice.title||invoice.fileName||'Facture',side:'expense',categoryId:a?.categoryId||'expense-invoices',amountCents:cents(invoice.amount),order:a?.order??0});}
 for(const row of rows)if(!categories.some(c=>c.id===row.categoryId&&c.side===row.side))row.categoryId=row.side==='sale'?'sale-other':'expense-other';
 rows.sort((a,b)=>(a.order||0)-(b.order||0)||a.id.localeCompare(b.id));
 const expenses=rows.filter(x=>x.side==='expense').reduce((n,x)=>n+x.amountCents,0),sales=rows.filter(x=>x.side==='sale').reduce((n,x)=>n+x.amountCents,0),delta=sales-expenses,opening=cents(db.settings?.ncBalance);
 return {categories,rows,expenses,sales,delta,opening,balance:opening+delta};
}
export function moveBilanRow(db,rowId,categoryId){
 const data=bilanData(db),row=data.rows.find(x=>x.id===rowId),category=data.categories.find(x=>x.id===categoryId);
 if(!row||!category||category.side!==row.side)return false;
 let stored=db.ledger_entries.find(x=>x.id===row.id);
 if(!stored){stored={id:row.id,sourceId:row.sourceId,side:'expense'};db.ledger_entries.push(stored);}
 stored.categoryId=categoryId;stored.order=Math.max(0,...data.rows.map(x=>Number(x.order)||0))+1;return true;
}
