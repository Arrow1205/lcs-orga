export const taskUnassigned=t=>!t.assigneeId&&!t.owner;
export const canEditTask=(t,c)=>!c.closed&&c.role!=='viewer'&&(c.role==='admin'||!c.userId||t.assigneeId===c.userId||(taskUnassigned(t)&&t.createdBy===c.userId));
export function taskColumns(settings,members=[]){return settings.taskColumns||[{id:'backlog',title:'Backlog'},{id:'progress',title:'En cours'},{id:'done',title:'Terminées'},...members.filter(m=>m.member_role!=='viewer').map(m=>({id:'member-'+m.member_id,title:m.email,assigneeId:m.member_id}))];}
export function taskColumn(t,columns){return columns.find(c=>c.id===t.columnId)?.id||columns.find(c=>c.assigneeId&&c.assigneeId===t.assigneeId)?.id||columns.find(c=>c.id===(t.status==='Terminée'?'done':t.status==='En cours'?'progress':'backlog'))?.id||'backlog';}
export function moveTask(t,column,cloud,members=[]){
 if(cloud.closed||cloud.role==='viewer')throw Error('Lecture seule');
 const claim=taskUnassigned(t)&&!canEditTask(t,cloud);
 if(!canEditTask(t,cloud)&&!claim)throw Error('Tu peux modifier uniquement tes tâches.');
 if(cloud.role!=='admin'&&cloud.userId&&column.assigneeId&&column.assigneeId!==cloud.userId)throw Error('Tu peux attribuer une tâche uniquement à ton compte.');
 if(claim&&column.assigneeId!==cloud.userId)throw Error('Prends cette tâche dans ta colonne personnelle.');
 if(column.id==='done')completeTask(t,true,cloud,column.assigneeId||t.assigneeId||cloud.userId,members);
 else if(t.status==='Terminée'){if(claim)throw Error('Prends une tâche ouverte du backlog.');completeTask(t,false,cloud);}
 else t.status=column.id==='progress'?'En cours':'À faire';
 t.columnId=column.id;
 if(column.assigneeId){t.assigneeId=column.assigneeId;t.owner=members.find(m=>m.member_id===t.assigneeId)?.email||t.owner||'';}
 if(column.id==='backlog'){t.assigneeId='';t.owner='';}

}
export function completeTask(t,checked,c,performer=c.userId,members=[],permissionTask=t){
 if(!canEditTask(permissionTask,c))throw Error('Tu peux modifier uniquement tes tâches.');
 if(checked){t.status='Terminée';t.completedAt=new Date().toISOString();t.completedBy=c.role==='admin'?performer||c.userId:c.userId;t.completedActorId=c.userId;t.completedByLabel=members.find(m=>m.member_id===t.completedBy)?.email||c.userEmail||'Compte connecté';}
 else{t.status='À faire';for(const key of ['completedAt','completedBy','completedActorId','completedByLabel'])delete t[key];}
}
export function completionMarkup(t,esc){return t.completedAt?`<small class="task-completed">✓ ${esc(new Date(t.completedAt).toLocaleString('fr-FR'))} · ${esc(t.completedByLabel||t.completedBy||'Compte connecté')}</small>`:t.status==='Terminée'?'<small class="task-completed">✓ Terminée · date non renseignée</small>':'';}
export const taskRank=(t,tasks)=>t.rank??(tasks.indexOf(t)+1)*1024;
export function backlogMarkup(tasks,columns,cloud,esc,query=''){
 const admin=cloud.role==='admin'&&!cloud.closed;
 return `<div class="backlog-board" aria-label="Tableau des tâches">${columns.map((col,i)=>{const rows=tasks.filter(t=>taskColumn(t,columns)===col.id&&JSON.stringify(t).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>taskRank(a,tasks)-taskRank(b,tasks));return `<section class="backlog-column" data-task-drop="${esc(col.id)}" ${admin?'draggable="true"':''} data-column-drag="${esc(col.id)}"><header><h2>${esc(col.title)}</h2><span>${rows.length}</span>${admin?`<div class="actions"><button class="btn small" data-column-shift="${esc(col.id)}:-1" aria-label="Déplacer à gauche" ${i===0?'disabled':''}>←</button><button class="btn small" data-column-shift="${esc(col.id)}:1" aria-label="Déplacer à droite" ${i===columns.length-1?'disabled':''}>→</button><button class="btn small" data-column-edit="${esc(col.id)}" aria-label="Modifier la colonne">✎</button>${col.id!=='backlog'?`<button class="btn small danger" data-column-delete="${esc(col.id)}" aria-label="Supprimer la colonne">✕</button>`:''}</div>`:''}</header>${rows.map(t=>{const edit=canEditTask(t,cloud),claim=taskUnassigned(t)&&cloud.role!=='viewer'&&!cloud.closed;return `<article class="backlog-card" data-task-drag="${esc(t.id)}" draggable="${edit||claim}"><button class="backlog-title" data-edit="tasks:${esc(t.id)}">${esc(t.title)}</button><div class="task-meta">${esc(t.category||'')} · ${esc(t.owner||'Non attribuée')}${t.due?`<br>Échéance : ${esc(t.due)}`:''}</div><label class="task-check"><input type="checkbox" data-task-complete="${esc(t.id)}" ${t.status==='Terminée'?'checked':''} ${edit?'':'disabled'}> Réalisée</label>${completionMarkup(t,esc)}${edit||claim?`<label class="task-move">Déplacer<select data-task-move="${esc(t.id)}"><option value="">Choisir une colonne…</option>${columns.filter(c=>c.id!==col.id&&(cloud.role==='admin'||!c.assigneeId||c.assigneeId===cloud.userId)&&(!claim||edit||c.assigneeId===cloud.userId)).map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select></label>`:''}</article>`}).join('')}${!cloud.closed&&cloud.role!=='viewer'&&(admin||!col.assigneeId||col.assigneeId===cloud.userId)?`<button class="btn" data-task-add="${esc(col.id)}">＋ Ajouter une carte</button>`:''}</section>`}).join('')}${admin?'<button class="btn backlog-add" data-column-add>＋ Ajouter une colonne</button>':''}</div>`;
}
