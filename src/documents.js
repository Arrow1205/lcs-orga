// Document references stay in each record's existing JSON payload. Files remain private.
export function documentIndex(db){
 const rows=[];
 for(const kind of ['contacts','invoices','assets','partners','expenses'])for(const row of db[kind]||[]){
  const source=row.title||row.company||[row.first,row.last].filter(Boolean).join(' ')||row.name||kind;
  if(row.blobId)rows.push({...row,source});
  for(const a of [...(row.attachments||[]),...(row.partnerAssets||[])])if(a.blobId)rows.push({...a,source});
  if(row.logoId)rows.push({blobId:row.logoId,fileName:row.logoFileName||'Logo',source});
 }
 if(db.settings?.planPdf)rows.push(db.settings.planPdf);
 return [...new Map(rows.filter(x=>x.blobId).map(x=>[x.blobId,x])).values()];
}
export function documentsMarkup(kind,row,db,esc,readOnly=false){
 const buttons=a=>`<div class="actions"><button type="button" class="btn small" data-blob-view="${esc(a.blobId)}">Consulter</button><button type="button" class="btn small" data-blob-download="${esc(a.blobId)}">Télécharger</button></div>`;
 const files=(row.attachments||[]).filter(a=>a.blobId),owned=new Set([row.blobId,...files.map(a=>a.blobId)]);
 const options=documentIndex(db).filter(a=>!owned.has(a.blobId)).map(a=>`<option value="${esc(a.blobId)}">${esc(a.source||'Document')} · ${esc(a.label||a.fileName||'Fichier')}</option>`).join('');
 return `<section class="full record-documents"><h3>Documents</h3><p class="sub">PDF, images, mails, présentations et autres fichiers · 50 Mo maximum par fichier. Les formats sans aperçu sont téléchargés.</p>${row.blobId?`<div class="document-item"><strong>Fichier principal · ${esc(row.fileName||'Document')}</strong>${buttons(row)}</div>`:''}${files.map(a=>`<div class="document-item">${readOnly?`<strong>${esc(a.label||a.fileName)}</strong>`:`<label>Nom du document<input name="documentLabel:${esc(a.blobId)}" value="${esc(a.label||a.fileName)}"></label>`}${buttons(a)}${readOnly?'':`<label>Remplacer le fichier<input type="file" name="replaceAttachment:${esc(a.blobId)}"></label><label class="document-remove"><input type="checkbox" name="removeAttachment" value="${esc(a.blobId)}"> Retirer de cette fiche</label>`}</div>`).join('')}${readOnly?'':`<label>Ajouter des documents<input type="file" multiple name="attachmentsUpload"></label>${options?`<label>Rattacher des documents existants<select name="linkedDocuments" multiple size="4">${options}</select><small>Plusieurs choix possibles avec Ctrl / Cmd.</small></label>`:''}${kind==='invoices'?`${options?`<label>Ou utiliser un fichier existant comme document principal<select name="linkedPrimaryDocument"><option value="">Conserver le fichier actuel</option>${options}</select></label>`:''}<label>Devis associé<select name="sourceQuoteId"><option value="">Aucun</option>${(db.invoices||[]).filter(x=>x.tag==='Devis'&&x.id!==row.id).map(x=>`<option value="${esc(x.id)}" ${row.sourceQuoteId===x.id?'selected':''}>${esc(x.title||x.fileName)}</option>`).join('')}</select></label>`:''}`}${row.sourceQuoteId?`<p class="sub">Devis associé : ${esc(db.invoices.find(x=>x.id===row.sourceQuoteId)?.title||'Devis')}</p>`:''}</section>`;
}
export function readDocumentChanges(form){
 const changes={labels:{},replacements:{},links:form.getAll('linkedDocuments').map(String),primary:String(form.get('linkedPrimaryDocument')||'')};
 for(const [key,value] of [...form.entries()]){
  if(key.startsWith('documentLabel:')){changes.labels[key.slice(14)]=String(value).trim();form.delete(key)}
  if(key.startsWith('replaceAttachment:')){if(value?.size)changes.replacements[key.slice(18)]=value;form.delete(key)}
 }
 form.delete('linkedDocuments');form.delete('linkedPrimaryDocument');return changes;
}
export async function applyDocuments({draft,existing,db,changes,uploads=[],removed=[],putBlob,id,readOnly=false}){
 if(readOnly)throw Error('Lecture seule');
 const index=new Map(documentIndex(db).map(a=>[a.blobId,a]));
 for(const key of [...changes.links,...(changes.primary?[changes.primary]:[])])if(!index.has(key))throw Error('Document associé introuvable.');
 const old=existing?.attachments||[];
 for(const key of Object.keys(changes.replacements))if(!old.some(a=>a.blobId===key))throw Error('Pièce jointe introuvable.');
 for(const file of [...uploads,...Object.values(changes.replacements)])if(file.size>50*1024*1024)throw Error('Maximum 50 Mo par fichier');
 if(draft.sourceQuoteId&&!db.invoices.some(x=>x.id===draft.sourceQuoteId&&x.tag==='Devis'&&x.id!==draft.id))throw Error('Devis associé introuvable.');
 const transfer=async file=>{const blobId=id();await putBlob(blobId,file);return {blobId,fileName:file.name,mime:file.type||'application/octet-stream',size:file.size}};
 const attachments=[];
 for(const a of old){if(removed.includes(a.blobId))continue;const replacement=changes.replacements[a.blobId];attachments.push({...a,...(replacement?await transfer(replacement):{}),label:changes.labels[a.blobId]||a.label||a.fileName})}
 for(const file of uploads)attachments.push(await transfer(file));
 for(const key of changes.links){const {blobId,fileName,mime,size,label}=index.get(key);attachments.push({blobId,fileName,mime,size,label})}
 if(changes.primary){const a=index.get(changes.primary);draft.blobId=a.blobId;draft.fileName=a.fileName;draft.mime=a.mime;if(!draft.title)draft.title=a.fileName}
 draft.attachments=[...new Map(attachments.filter(a=>a.blobId!==draft.blobId).map(a=>[a.blobId,a])).values()];
 return draft;
}
