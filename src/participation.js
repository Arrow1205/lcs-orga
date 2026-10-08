import {exhibitorAmount,tableCount} from './exhibitor-import.js';
export const amountNumber=value=>{let text=String(value??0).replace(/\s|€/g,'');if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');return Math.max(0,Number(text)||0)};
export const activeExhibitor=row=>row.status!=='Annulé';
export const engagedPartner=row=>['Accord','Confirmé','Validé','Terminé','Payé'].includes(row.status);
export function exhibitorRevenue(row,settings={}){
 const stored=amountNumber(row.amount),calculated=exhibitorAmount(row.vendorType,tableCount(row.tables),settings);
 // Les anciens montants non nuls, sans indication d'automatisme, restent intacts.
 return !row.amountEdited&&(row.amountEdited===false||!stored)&&calculated!==null?calculated:stored;
}
export function partnerRevenue(row,settings={}){
 return row.amountForced?amountNumber(row.amount):Math.round(amountNumber(row.quantity)*amountNumber(row.unit==='m²'?settings.partnerSqmPrice:settings.partnerTablePrice)*100)/100;
}
export function participationTotals(db){
 const exhibitors=(db.exhibitors||[]).filter(activeExhibitor),partners=(db.partners||[]).filter(engagedPartner);
 return {tables:exhibitors.reduce((n,x)=>n+tableCount(x.tables),0),exhibitors:exhibitors.reduce((n,x)=>n+Math.round(exhibitorRevenue(x,db.settings)*100),0)/100,partners:partners.reduce((n,x)=>n+Math.round(partnerRevenue(x,db.settings)*100),0)/100};
}
