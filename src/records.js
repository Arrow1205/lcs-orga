export const collectionNames=['exhibitors','contacts','partners','tasks','posts','expenses','ideas','assets','invoices','zones'];
const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export function splitRecords(state){
 const rows=new Map();
 for(const entity of collectionNames){
  for(const row of state?.[entity]||[]){
   if(!row.id)throw Error('Une fiche sans identifiant ne peut pas être enregistrée.');
   const key=entity+':'+row.id;if(rows.has(key))throw Error('Identifiant dupliqué : '+key);
   rows.set(key,{entity,id:String(row.id),value:row});
  }
 }
 for(const [entity,id,key] of [['settings','main','settings'],['forecast','2027','forecast2027']])if(state?.[key])rows.set(entity+':'+id,{entity,id,value:state[key]});
 const meta=Object.fromEntries(Object.entries(state||{}).filter(([key])=>![...collectionNames,'settings','forecast2027','updatedAt'].includes(key)));
 rows.set('metadata:main',{entity:'metadata',id:'main',value:meta});return rows;
}
export function diffRecords(before,after){
 const old=splitRecords(before),next=splitRecords(after),changes=[];
 for(const key of new Set([...old.keys(),...next.keys()])){
  const a=old.get(key),b=next.get(key);
  if(stable(a?.value??null)!==stable(b?.value??null))changes.push({entity:(b||a).entity,id:(b||a).id,before:a?.value??null,after:b?.value??null});
 }
 return changes;
}
// La base n'avance qu'après accusé du serveur. Le même lot est rejoué avec le
// même UUID si le réseau coupe après COMMIT et avant la réponse HTTP.
export class RecordSync {
 constructor({initial,write,onStatus=()=>{},onError=()=>{},persist=()=>{},clear=()=>{}}){
  Object.assign(this,{write,onStatus,onError,persist,clear});this.base=structuredClone(initial.data);this.revision=Number(initial.revision);this.latest=this.base;this.pending=null;this.flight=null;this.running=false;this.blocked=false;this.refreshNeeded=false;
 }
 get dirty(){return this.running||!!this.pending||this.blocked;}
 journal(){this.persist({base:this.base,latest:this.latest,flight:this.flight,revision:this.revision});}
 enqueue(data){this.latest=structuredClone(data);this.pending=this.latest;try{this.journal();}catch(e){this.blocked=true;this.onError(e,this.latest);return;}if(!this.blocked)this.drain();}
 async drain(){
  if(this.running||this.blocked)return;this.running=true;this.onStatus('Enregistrement…');
  while(this.pending&&!this.blocked){
   try{
    if(!this.flight){const target=this.pending;const changes=diffRecords(this.base,target);this.flight={id:crypto.randomUUID(),changes,target};}
    this.pending=null;this.journal();
    if(this.flight.changes.length){this.revision=Number(await this.write(this.flight.id,this.flight.changes));this.refreshNeeded=true;}
    this.base=this.flight.target;this.flight=null;
    if(diffRecords(this.base,this.latest).length)this.pending=this.latest;
    // Une modification arrivée pendant la requête sera comparée à la base acquittée.
    if(this.pending)this.journal();else this.clear();
   }catch(error){this.pending=this.latest;this.blocked=true;this.onError(error,this.latest);}
  }
  this.running=false;if(!this.blocked)this.onStatus('Enregistré');
 }
 retry(){if(!this.blocked)return;this.blocked=false;this.drain();}
 accept(remote){if(this.dirty)return false;this.base=structuredClone(remote.data);this.latest=this.base;this.revision=Number(remote.revision);this.refreshNeeded=false;return true;}
}
