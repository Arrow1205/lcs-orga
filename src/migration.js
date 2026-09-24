export const collections=['exhibitors','contacts','partners','tasks','posts','expenses','ideas','assets','invoices'];
export function validateState(state){
 if(!state||state.schema!==1)throw Error('Format de CRM non reconnu.');
 for(const key of ['exhibitors','contacts','tasks','posts','expenses','zones'])if(!Array.isArray(state[key]))throw Error('Collection manquante : '+key);
 for(const key of collections)if(state[key]&&!Array.isArray(state[key]))throw Error('Collection invalide : '+key);
 return state;
}
export function isEmpty(state){return !state||collections.every(k=>!(state[k]?.length));}
export function referencedFiles(state){return [...new Set(collections.flatMap(k=>(state[k]||[]).flatMap(x=>[x.blobId,x.logoId,x.imageId].filter(Boolean))))];}
export async function decodeMigration(pack){
 if(pack.format!=='lcs-migration'||pack.version!==1)throw Error('Utilise le fichier produit par l’outil de migration fourni.');
 validateState(pack.state);if(pack.missing?.length)throw Error('Des pièces jointes manquaient lors de l’export local. Rattache-les dans la V1 puis recommence.');
 const byId=new Map();
 for(const f of pack.files||[]){if(!/^[a-zA-Z0-9_.-]{1,160}$/.test(f.id)||byId.has(f.id))throw Error('Identifiant de fichier invalide ou dupliqué.');
  if(typeof f.base64!=='string'||f.base64.length>70*1024*1024)throw Error('Fichier trop volumineux (50 Mo maximum).');
  const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==f.sha256)throw Error('Intégrité du fichier non vérifiée : '+f.id);
  byId.set(f.id,new Blob([bytes],{type:f.type||'application/octet-stream'}));
 }
 for(const id of referencedFiles(pack.state))if(!byId.has(id))throw Error('Pièce jointe absente : '+id);
 return {state:structuredClone(pack.state),files:byId};
}
