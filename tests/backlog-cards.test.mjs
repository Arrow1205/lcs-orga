import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {startCRM} from '../src/crm.js';
import {backlogMarkup,taskColumns,taskOverdue,completeTask,moveTask,memberName} from '../src/backlog.js';
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002';
const members=[{member_id:admin,email:'alex@example.test',first_name:'Alex',member_role:'admin'},{member_id:editor,email:'camille@example.test',first_name:'Camille',member_role:'editor'}];
const esc=s=>String(s??'').replace(/[&<>"']/g,'_');
test('cartes compactes, filtres, priorité, retards, commentaires et prénoms',()=>{
 const cloud={role:'admin',userId:admin,members},columns=taskColumns({},members),tasks=[{id:'a',title:'À faire',assigneeId:editor,owner:'camille@example.test',columnId:'member-'+editor,status:'À faire',priority:'Haute',due:'2000-01-01',comments:[{text:'Ok'}]},{id:'b',title:'Fini',columnId:'member-'+editor,status:'Terminée',completedAt:'2026-10-08T10:00:00Z',completedBy:editor,completedByLabel:'camille@example.test'},{id:'c',title:'En cours',columnId:'member-'+editor,status:'En cours'}];
 const html=backlogMarkup(tasks,columns,cloud,esc,'',{overdueColor:'#ff3300'}),dom=new JSDOM(html),col=dom.window.document.querySelector('[data-task-drop="member-'+editor+'"]');
 assert.equal(col.querySelectorAll('.backlog-card').length,1);assert.equal(col.querySelectorAll('[data-column-status]').length,3);assert.equal(col.querySelector('.backlog-count.overdue').textContent,'1');assert.equal(col.querySelector('.backlog-count.done').textContent,'1');assert.ok(col.querySelector('.is-overdue'));assert.equal(col.querySelector('.task-priority').textContent,'!!!');assert.equal(col.querySelector('.task-comments-badge').textContent.trim(),'◌ 1');assert.equal(col.querySelector('details').open,false);assert.equal(col.querySelector('select'),null);assert.doesNotMatch(html,/@example|data-column-shift/);
 const done=backlogMarkup(tasks,columns,cloud,esc,'',{statuses:{['member-'+editor]:'Terminée'}});assert.match(done,/Camille/);assert.match(done,/2026/);
 assert.equal(taskOverdue(tasks[1],'2026-10-08'),false);assert.equal(taskOverdue({...tasks[0],due:'2026-10-08'},'2026-10-08'),false);assert.equal(memberName({email:'private@test.fr'}),'Prénom à renseigner');dom.window.close();
});
test('tri dans la même colonne conserve le statut et la trace de réalisation',()=>{
 const cloud={role:'admin',userId:admin,members},task={id:'x',assigneeId:editor,columnId:'member-'+editor};completeTask(task,true,cloud,editor,members);const stamp=task.completedAt;moveTask(task,taskColumns({},members).find(c=>c.assigneeId===editor),cloud,members);assert.equal(task.status,'Terminée');assert.equal(task.completedAt,stamp);assert.equal(task.completedByLabel,'Camille');
});
test('ajout simplifié, compte responsable unique, commentaires avec auteur connecté',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://crm.test/taches-planning?year=2026'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,Event:dom.window.Event,scrollTo:()=>{},alert:()=>{},confirm:()=>true});
 const api=startCRM(null,{role:'admin',userId:admin,members,save:()=>{}});assert.ok(document.querySelector('.backlog-board'));
 document.querySelector('[data-task-add="member-'+editor+'"]').click();let form=document.getElementById('editForm');assert.equal(form.elements.columnId,undefined);assert.equal(form.elements.owner,undefined);assert.equal(form.elements.completedBy,undefined);assert.match(form.querySelector('[data-field="assigneeId"]').textContent,/À réaliser par/);assert.doesNotMatch(form.textContent,/@example/);
 form.elements.title.value='Imprimer';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));let task=api.getState().tasks[0];assert.equal(task.assigneeId,editor);assert.equal(task.owner,'Camille');
 document.querySelector('[data-edit="tasks:'+task.id+'"]').click();form=document.getElementById('commentForm');assert.equal(form.elements.author,undefined);form.elements.text.value='C’est prêt';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));task=api.getState().tasks[0];assert.equal(task.comments[0].authorId,admin);assert.equal(task.comments[0].author,'Alex');assert.ok(task.comments[0].createdAt);dom.window.close();
});
