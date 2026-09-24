// Une seule écriture à la fois. Un conflit bloque la file, sans écraser le serveur.
export class SnapshotSync {
 constructor({revision,write,onStatus=()=>{},onError=()=>{}}){Object.assign(this,{revision,write,onStatus,onError});this.pending=null;this.running=false;this.blocked=false;this.latest=null;}
 enqueue(data){this.latest=structuredClone(data);this.pending=this.latest;if(!this.blocked)this.drain();}
 get dirty(){return this.running||!!this.pending||this.blocked;}
 async drain(){if(this.running||this.blocked)return;this.running=true;this.onStatus('Enregistrement…');
  while(this.pending&&!this.blocked){const snapshot=this.pending;this.pending=null;try{this.revision=Number(await this.write(this.revision,snapshot));}catch(error){this.pending=this.latest;this.blocked=true;this.onError(error,this.latest);}}
  this.running=false;if(!this.blocked)this.onStatus('Enregistré');
 }
 retry(){if(!this.blocked)return;this.blocked=false;this.drain();}
}
