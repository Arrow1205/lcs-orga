import {exhibitorAmount,tableCount,normalize} from './exhibitor-import.js';
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

const zoneKey=value=>normalize(value).replace(/[^a-z0-9]/g,'');
export function resolveZone(value,zones){
 if(!value)return null;
 const key=zoneKey(value),direct=zones.find(z=>zoneKey(z.id)===key||zoneKey(z.name)===key);
 if(direct)return direct;
 const alias=/^(football|foot|soccer)$/.test(key)?'soccer':/^(basket|basketball|nba)$/.test(key)?'basket':/^(sportus|sportsus|baseball|nfl|mlb|hockey)$/.test(key)?'sportsus':/^(tcg|pokemon|tcgpokemon)$/.test(key)?'tcg':'';
 return alias?zones.find(z=>zoneKey(z.id)===alias||zoneKey(z.name)===alias)||null:null;
}
export function implantation(db){
 const zones=(db.zones||[]).map(zone=>({...zone,assigned:0,pending:0}));let unclassified=0;
 for(const row of (db.exhibitors||[]).filter(activeExhibitor)){
  const tables=tableCount(row.tables),assigned=resolveZone(row.zone,zones);
  if(assigned){assigned.assigned+=tables;continue;}
  const community=resolveZone(row.community,zones);
  if(community)community.pending+=tables;else unclassified+=tables;
 }
 return {zones:zones.map(zone=>({...zone,total:zone.assigned+zone.pending})),unclassified};
}
