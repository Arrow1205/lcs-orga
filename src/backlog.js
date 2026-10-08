export function memberName(member){return member?.first_name?.trim()||'Prénom à renseigner';}
export function accountName(id,members=[],legacy=''){const member=members.find(m=>m.member_id===id||m.email===legacy);return member?memberName(member):legacy&&!legacy.includes('@')?legacy:'Prénom à renseigner';}
export const taskOverdue=(task,today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Paris'}))=>task.status!=='Terminée'&&!!task.due&&task.due<today;
export const taskStatusGroup=t=>t.status==='Terminée'?'Terminée':t.status==='En cours'?'En cours':'À faire';
export const taskUnassigned=t=>!t.assigneeId&&!t.owner;
export const canEditTask=(t,c)=>!c.closed&&c.role!=='viewer'&&(c.role==='admin'||!c.userId||t.assigneeId===c.userId||(taskUnassigned(t)&&t.createdBy===c.userId));
export function taskColumns(settings,members=[]){return settings.taskColumns||[{id:'backlog',title:'Backlog'},{id:'progress',title:'En cours'},{id:'done',title:'Terminées'},...members.filter(m=>m.member_role!=='viewer').map(m=>({id:'member-'+m.member_id,title:memberName(m),assigneeId:m.member_id}))];}
export function taskColumn(t,columns){return columns.find(c=>c.id===t.columnId)?.id||columns.find(c=>c.assigneeId&&c.assigneeId===t.assigneeId)?.id||columns.find(c=>c.id===(t.status==='Terminée'?'done':t.status==='En cours'?'progress':'backlog'))?.id||'backlog';}
export function moveTask(t,column,cloud,members=[]){
 if(cloud.closed||cloud.role==='viewer')throw Error('Lecture seule');
 const claim=taskUnassigned(t)&&!canEditTask(t,cloud);
 if(!canEditTask(t,cloud)&&!claim)throw Error('Tu peux modifier uniquement tes tâches.');
 if(cloud.role!=='admin'&&cloud.userId&&column.assigneeId&&column.assigneeId!==cloud.userId)throw Error('Tu peux attribuer une tâche uniquement à ton compte.');
 if(claim&&column.assigneeId!==cloud.userId)throw Error('Prends cette tâche dans ta colonne personnelle.');
 if(t.columnId===column.id)return;
 if(column.id==='done')completeTask(t,true,cloud,column.assigneeId||t.assigneeId||cloud.userId,members);
 else if(t.status==='Terminée'&&['backlog','progress'].includes(column.id)){if(claim)throw Error('Prends une tâche ouverte du backlog.');completeTask(t,false,cloud);}
 else t.status=column.id==='progress'?'En cours':column.id==='backlog'?'À faire':t.status||'À faire';
 t.columnId=column.id;
 if(column.assigneeId){t.assigneeId=column.assigneeId;t.owner=accountName(t.assigneeId,members,t.owner);}
 if(column.id==='backlog'){t.assigneeId='';t.owner='';}

}
export function completeTask(t,checked,c,performer=c.userId,members=[],permissionTask=t){
 if(!canEditTask(permissionTask,c))throw Error('Tu peux modifier uniquement tes tâches.');
 if(checked){t.status='Terminée';t.completedAt=new Date().toISOString();t.completedBy=c.role==='admin'?performer||c.userId:c.userId;t.completedActorId=c.userId;t.completedByLabel=accountName(t.completedBy,members);}
 else{t.status='À faire';for(const key of ['completedAt','completedBy','completedActorId','completedByLabel'])delete t[key];}
}
export function completionMarkup(t,esc,members=[]){return t.completedAt?`<small class="task-completed">✓ ${esc(new Date(t.completedAt).toLocaleString('fr-FR'))} · ${esc(accountName(t.completedBy,members,t.completedByLabel))}</small>`:t.status==='Terminée'?'<small class="task-completed">✓ Terminée · date non renseignée</small>':'';}
export const taskRank=(t,tasks)=>t.rank??(tasks.indexOf(t)+1)*1024;
export function backlogMarkup(tasks,columns,cloud,esc,query='',options={}){
 const admin=cloud.role==='admin'&&!cloud.closed,members=cloud.members||[];
 return `<div class="backlog-board" aria-label="Tableau des tâches">${columns.map(col=>{
 const all=tasks.filter(t=>taskColumn(t,columns)===col.id),found=all.filter(t=>JSON.stringify(t).toLowerCase().includes(query.toLowerCase())),active=options.statuses?.[col.id]||(col.id==='done'?'Terminée':col.id==='progress'?'En cours':'À faire'),rows=found.filter(t=>col.id==='backlog'||taskStatusGroup(t)===active).sort((a,b)=>taskRank(a,tasks)-taskRank(b,tasks)),overdue=all.filter(t=>taskOverdue(t)).length,done=all.filter(t=>t.status==='Terminée').length;
 const title=col.assigneeId&&(!col.title||col.title.includes('@'))?accountName(col.assigneeId,members):col.title;
 return `<section class="backlog-column" data-task-drop="${esc(col.id)}" ${admin?'draggable="true"':''} data-column-drag="${esc(col.id)}"><header><h2>${esc(title)}</h2><span class="backlog-count" title="Total des tâches">${all.length}</span><span class="backlog-count overdue" title="Tâches en retard">${overdue}</span><span class="backlog-count done" title="Tâches réalisées">${done}</span>${admin?`<div class="actions"><button class="btn small" data-column-edit="${esc(col.id)}" aria-label="Modifier la colonne">✎</button>${col.id!=='backlog'?`<button class="btn small danger" data-column-delete="${esc(col.id)}" aria-label="Supprimer la colonne">✕</button>`:''}</div>`:''}</header>${col.id!=='backlog'?`<div class="backlog-status-tabs" role="group" aria-label="Statut des tâches de ${esc(title)}">${[['À faire','À faire'],['En cours','En cours'],['Terminée','Terminé']].map(([status,label])=>`<button type="button" data-column-status="${esc(col.id)}" data-status="${status}" aria-pressed="${active===status}" class="${active===status?'active':''}">${label} <small>${found.filter(t=>taskStatusGroup(t)===status).length}</small></button>`).join('')}</div>`:''}${rows.map(t=>{
 const edit=canEditTask(t,cloud),claim=taskUnassigned(t)&&cloud.role!=='viewer'&&!cloud.closed,late=taskOverdue(t),priority=t.priority==='Haute'?'!!!':t.priority==='Normale'?'!':'',comments=t.comments?.length||0,color=/^#[0-9a-f]{6}$/i.test(options.overdueColor||'')?options.overdueColor:'#d63d4a';
 return `<article class="backlog-card compact ${late?'is-overdue':''}" style="--task-overdue:${color}" data-task-drag="${esc(t.id)}" draggable="${edit||claim}"><div class="backlog-card-top"><input type="checkbox" aria-label="Marquer ${esc(t.title)} comme réalisée" data-task-complete="${esc(t.id)}" ${t.status==='Terminée'?'checked':''} ${edit?'':'disabled'}><button class="backlog-title" data-edit="tasks:${esc(t.id)}">${esc(t.title)}</button>${priority?`<span class="task-priority" title="Priorité ${esc(t.priority)}">${priority}</span>`:''}</div><div class="backlog-card-tags"><span class="task-status-tag ${taskStatusGroup(t)==='Terminée'?'done':taskStatusGroup(t)==='En cours'?'progress':'todo'}">${esc(t.status||'À faire')}</span>${t.due?`<small class="task-due ${late?'overdue':''}" title="Échéance">${esc(new Date(t.due+'T12:00:00').toLocaleDateString('fr-FR'))}${late?' · En retard':''}</small>`:''}${comments?`<button type="button" class="task-comments-badge" data-edit="tasks:${esc(t.id)}" aria-label="${comments} commentaire(s)">◌ ${comments}</button>`:''}</div>${completionMarkup(t,esc,members)}<details class="task-card-details"><summary>Détails</summary><div class="task-meta">${esc(t.category||'')} · ${esc(t.assigneeId||t.owner?accountName(t.assigneeId,members,t.owner):'Non attribuée')}</div>${t.note?`<p>${esc(t.note)}</p>`:''}</details></article>`;
 }).join('')}${!rows.length?'<p class="sub backlog-empty">Aucune tâche dans cette vue.</p>':''}${!cloud.closed&&cloud.role!=='viewer'&&(admin||!col.assigneeId||col.assigneeId===cloud.userId)?`<button class="btn" data-task-add="${esc(col.id)}">＋ Ajouter une carte</button>`:''}</section>`;
 }).join('')}${admin?'<button class="btn backlog-add" data-column-add>＋ Ajouter une colonne</button>':''}</div>`;
}
