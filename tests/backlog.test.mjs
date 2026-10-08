import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {PGlite} from '@electric-sql/pglite';
import {startCRM} from '../src/crm.js';
import {canEditTask,taskColumns,moveTask,completeTask} from '../src/backlog.js';
const admin='00000000-0000-0000-0000-000000000001',editor='00000000-0000-0000-0000-000000000002',other='00000000-0000-0000-0000-000000000003',wid='10000000-0000-0000-0000-000000000001';
const members=[{member_id:admin,email:'admin@test.fr',member_role:'admin'},{member_id:editor,email:'editor@test.fr',member_role:'editor'},{member_id:other,email:'other@test.fr',member_role:'editor'}];
test('claim, restricted destinations, completion and legacy tasks',()=>{
 const c={role:'editor',userId:editor},t={id:'a',title:'Shared',createdBy:admin,status:'À faire'},cols=taskColumns({},members);
 assert.equal(canEditTask(t,c),false);assert.throws(()=>moveTask(t,cols.find(c=>c.assigneeId===other),c,members));
 moveTask(t,cols.find(c=>c.assigneeId===editor),c,members);assert.equal(t.assigneeId,editor);assert.equal(canEditTask(t,c),true);
 completeTask(t,true,c,other,members);assert.equal(t.completedBy,editor);assert.ok(t.completedAt);
 moveTask(t,cols[0],c,members);assert.equal(t.completedAt,undefined);assert.equal(t.assigneeId,'');
 assert.equal(canEditTask({owner:'Alice'},c),false);assert.equal(canEditTask(t,{...c,closed:true}),false);
});
test('board shares dated tasks with list/calendar and records completion',async()=>{
 const dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'https://crm.test/taches-planning?year=2026'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,Event:dom.window.Event,scrollTo:()=>{},alert:()=>{},confirm:()=>true});
 const saved=[],cloud={role:'admin',userId:admin,userEmail:'admin@test.fr',members,save:s=>saved.push(structuredClone(s))};const api=startCRM(null,cloud);
 document.querySelector('[data-tab="tasks:backlog"]').click();assert.ok(document.querySelector('.backlog-board'));
 document.querySelector('[data-task-add="backlog"]').click();let form=document.getElementById('editForm');form.elements.title.value='Plan grand écran';form.elements.due.value='2026-10-08';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 const t=api.getState().tasks[0];assert.equal(t.due,'2026-10-08');assert.equal(t.columnId,'backlog');
 const select=document.querySelector('[data-task-move]');select.value='member-'+editor;select.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(api.getState().tasks[0].assigneeId,editor);
 const check=document.querySelector('[data-task-complete]');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(api.getState().tasks[0].completedBy,editor);assert.equal(api.getState().tasks[0].completedActorId,admin);
 document.querySelector('[data-tab="tasks:list"]').click();assert.match(document.querySelector('tbody').textContent,/Plan grand écran/);assert.match(document.querySelector('tbody').textContent,/editor@test.fr/);
 document.querySelector('[data-tab="tasks:calendar"]').click();assert.ok(document.querySelector('[data-edit="tasks:'+t.id+'"]'));
 document.querySelector('[data-tab="tasks:backlog"]').click();document.querySelector('[data-column-add]').click();form=document.getElementById('taskColumnForm');form.elements.title.value='Impressions';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));assert.ok(api.getState().settings.taskColumns.some(c=>c.title==='Impressions'));
 dom.window.close();
});
test('SQL protects tasks/columns, claiming is atomic, completion provenance enforced',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table crm_workspaces(id uuid primary key,name text);create table crm_members(workspace_id uuid,user_id uuid,role text);create table crm_state(workspace_id uuid primary key,data jsonb,revision bigint default 0);create function crm_has_role(w text,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.crm_members where workspace_id::text=w and user_id=auth.uid() and role=any(roles))$$;insert into auth.users values('${admin}','admin@test.fr'),('${editor}','editor@test.fr'),('${other}','other@test.fr');insert into crm_workspaces values('${wid}','Test');insert into crm_members values('${wid}','${admin}','admin'),('${wid}','${editor}','editor'),('${wid}','${other}','editor');insert into crm_state(workspace_id,data) values('${wid}','{"schema":1,"settings":{},"tasks":[]}');select set_config('request.jwt.claim.sub','${admin}',false);`);
 for(const file of ['002_records.sql','003_editions.sql','008_close_editions.sql','016_backlog.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const apply=async(id,before,after,entity='tasks',req=crypto.randomUUID())=>(await db.query('select crm_apply_changes($1,$2,$3,2026) as r',[wid,req,JSON.stringify([{id,entity,before,after}])])).rows[0].r;
 const shared={id:'s',title:'Partagée',createdBy:admin,columnId:'backlog',status:'À faire'},owned={id:'a',title:'Admin',assigneeId:admin,owner:'admin@test.fr',columnId:'member-'+admin};
 await apply('s',null,shared);await apply('a',null,owned);
 await db.exec(`select set_config('request.jwt.claim.sub','${editor}',false);set role authenticated;`);
 await assert.rejects(apply('a',owned,{...owned,title:'Vol'}),e=>e.code==='42501');await assert.rejects(apply('a',owned,null),e=>e.code==='42501');
 await assert.rejects(apply('s',shared,{...shared,assigneeId:editor,owner:'editor@test.fr',columnId:'member-'+editor,title:'Vol'}),e=>e.code==='42501');
 const claimed={...shared,assigneeId:editor,owner:'editor@test.fr',columnId:'member-'+editor};await apply('s',shared,claimed);
 await assert.rejects(apply('s',claimed,{...claimed,assigneeId:other,columnId:'member-'+other}),e=>e.code==='42501');
 await assert.rejects(apply('s',claimed,{...claimed,status:'Terminée'}),/Trace/);
 const done={...claimed,status:'Terminée',completedAt:new Date().toISOString(),completedBy:editor,completedActorId:editor,completedByLabel:'editor@test.fr'};const req=crypto.randomUUID();const rev=await apply('s',claimed,done,'tasks',req);assert.equal(await apply('s',claimed,done,'tasks',req),rev);
 await assert.rejects(apply('s',done,{...done,completedBy:other}),e=>e.code==='42501');
 const settings=(await db.query('select payload from crm_settings')).rows[0].payload;await assert.rejects(apply('main',settings,{...settings,taskColumns:[{id:'backlog',title:'Backlog'}]},'settings'),e=>e.code==='42501');
 await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);set role authenticated;`);await assert.rejects(apply('s',shared,{...claimed,assigneeId:other,columnId:'member-'+other}),e=>e.code==='40001');
 await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;`);await apply('a',owned,{...owned,title:'Administrateur peut modifier'});await apply('main',settings,{...settings,taskColumns:taskColumns({},members)},'settings');
 await db.query('select crm_set_edition_closed($1,2026,true)',[wid]);await assert.rejects(apply('s',done,null),e=>e.code==='42501');
 }finally{await db.close();}
});
