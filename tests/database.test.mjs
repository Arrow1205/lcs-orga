import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/002_records.sql',import.meta.url),'utf8');
const uid='00000000-0000-0000-0000-000000000001',wid='10000000-0000-0000-0000-000000000001';
async function setup(source){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table public.crm_workspaces(id uuid primary key,name text);
 create table public.crm_members(workspace_id uuid,user_id uuid,role text);
 create table public.crm_state(workspace_id uuid primary key,data jsonb,revision bigint default 0);
 create function public.crm_has_role(w text,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.crm_members where workspace_id::text=w and user_id=auth.uid() and role=any(roles))$$;
 insert into auth.users values('${uid}'); insert into crm_workspaces values('${wid}','Test');
 insert into crm_members values('${wid}','${uid}','admin');
 select set_config('request.jwt.claim.sub','${uid}',false);`);
 await db.query('insert into crm_state(workspace_id,data) values($1,$2)',[wid,source]);return db;
}
const read=async db=>(await db.query('select crm_read_records($1) as state',[wid])).rows[0].state;
const apply=async(db,changes,id=crypto.randomUUID())=>(await db.query('select crm_apply_changes($1,$2,$3) as revision',[wid,id,JSON.stringify(changes)])).rows[0].revision;
const before={id:'one',title:'Initial',custom:{unrecognized:'conservé'},comments:[{text:'Bonjour'}]};
test('migration conserve les données en ligne, fichiers et champs inconnus ; sécurité et conflits',async()=>{
 const source={schema:1,contactSplitVersion:1,settings:{owners:['A']},forecast2027:{extraRevenue:[{id:'r',amount:23}]},tasks:[before],partners:[{id:'p',goodies:[{name:'Cartes',value:'50'}],logoId:'existing-logo'}],invoices:[{id:'i',blobId:'existing-file',amount:12}],customRoot:{legacy:true}};
 const db=await setup(source);
 try{
  await db.exec(sql);
  const migrated=(await read(db)).data;
  for(const key of Object.keys(source))assert.deepEqual(migrated[key],source[key]);
  assert.deepEqual((await db.query('select data from crm_state')).rows[0].data,source);
  await assert.rejects(db.query('select crm_save_state($1,0,$2)',[wid,source]),/obsolète/);
  const edit={entity:'tasks',id:'one',before,after:{...before,title:'Modifié'}};
  const request=crypto.randomUUID();const rev=await apply(db,[edit],request);
  assert.equal(await apply(db,[edit],request),rev);
  assert.equal((await db.query('select count(*)::int as n from crm_history')).rows[0].n,1);
  await assert.rejects(apply(db,[{...edit,after:{...before,title:'Perdu'}}]),e=>e.code==='40001');
  // Une autre fiche issue d'une ancienne lecture peut être enregistrée.
  await apply(db,[{entity:'tasks',id:'two',before:null,after:{id:'two',title:'Autre personne'}}]);
  // Le lot entier est annulé si l'une des fiches est périmée.
  await assert.rejects(apply(db,[{entity:'ideas',id:'x',before:null,after:{id:'x',title:'Rollback'}},edit]),e=>e.code==='40001');
  assert.equal((await db.query('select count(*)::int as n from crm_ideas')).rows[0].n,0);
  await apply(db,[{entity:'tasks',id:'one',before:edit.after,after:null}]);
  const history=(await db.query("select id,before_data from crm_history where entity='tasks' and after_data is null")).rows[0];assert.deepEqual(history.before_data,edit.after);
  await db.query('select crm_restore_history($1,$2)',[history.id,crypto.randomUUID()]);
  assert.equal((await read(db)).data.tasks.find(t=>t.id==='one').title,'Modifié');
  // Vérification des projections des montants et des documents.
  assert.equal((await db.query('select amount,"blobId" from crm_invoices')).rows[0].blobId,'existing-file');
  await db.exec("set role authenticated;");
  await assert.rejects(db.exec("insert into crm_tasks(workspace_id,id,payload) values('"+wid+"','bad','{}')"),e=>e.code==='42501');
  await db.exec('reset role;');await db.exec("update crm_members set role='viewer'; set role authenticated;");
  assert.equal((await read(db)).data.tasks.length,2);
  await assert.rejects(apply(db,[]),e=>e.code==='42501');
  assert.equal((await db.query('select * from crm_history')).rows.length,0);
  await db.exec('reset role;');await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false); set role authenticated;");
  assert.equal((await db.query('select * from crm_tasks')).rows.length,0);
  await assert.rejects(read(db),e=>e.code==='42501');
 }finally{await db.close();}
});
test('espace vide initialisé sans importer de données locales',async()=>{const db=await setup(null);try{await db.exec(sql);const data=(await read(db)).data;assert.equal(data.tasks.length,0);assert.equal(data.zones.length,4);assert.equal(data.contactSplitVersion,1);}finally{await db.close();}});
test('migration invalide : aucune table métier créée, source intacte',async()=>{const source={schema:1,tasks:[{title:'Sans id'}]};const db=await setup(source);try{await assert.rejects(db.exec(sql),/sans identifiant/);await db.exec('rollback');assert.equal((await db.query("select to_regclass('public.crm_tasks') as t")).rows[0].t,null);assert.deepEqual((await db.query('select data from crm_state')).rows[0].data,source);}finally{await db.close();}});
const editionsSQL=await readFile(new URL('../supabase/migrations/003_editions.sql',import.meta.url),'utf8');
test('années isolées, contacts partagés, restauration et anciennes données conservées',async()=>{
 const source={schema:1,contactSplitVersion:1,tasks:[before],contacts:[{id:'c',company:'Commun'}],settings:{totalTables:200,owners:['Alice']},forecast2027:{proPrice:50},assets:[{id:'file',blobId:'original-file'}]};
 const db=await setup(source);
 const readYear=async year=>(await db.query('select crm_read_records($1,$2) as state',[wid,year])).rows[0].state.data;
 const writeYear=async(year,changes,request=crypto.randomUUID())=>db.query('select crm_apply_changes($1,$2,$3,$4)',[wid,request,JSON.stringify(changes),year]);
 try{
  await db.exec(sql);await db.exec(editionsSQL);
  const old=await readYear(2026);for(const key of Object.keys(source))assert.deepEqual(old[key],source[key]);
  await db.query('select crm_create_edition($1,2027)',[wid]);
  const next=await readYear(2027);assert.equal(next.tasks.length,0);assert.equal(next.assets.length,0);assert.equal(next.settings.totalTables,0);assert.deepEqual(next.settings.owners,[]);assert.equal(next.forecast2027.proPrice,0);assert.deepEqual(next.contacts,source.contacts);assert.equal(next.zones[0].capacity,0);
  await writeYear(2027,[{entity:'tasks',id:'one',before:null,after:{id:'one',title:'2027'}}]);
  assert.equal((await readYear(2026)).tasks[0].title,'Initial');assert.equal((await readYear(2027)).tasks[0].title,'2027');
  await writeYear(2027,[{entity:'contacts',id:'c',before:source.contacts[0],after:{id:'c',company:'Commun modifié'}}]);
  assert.equal((await readYear(2026)).contacts[0].company,'Commun modifié');
  await assert.rejects(writeYear(2026,[{entity:'contacts',id:'c',before:source.contacts[0],after:{id:'c',company:'Écrasé'}}]),e=>e.code==='40001');
  await writeYear(2027,[{entity:'tasks',id:'one',before:{id:'one',title:'2027'},after:null}]);
  const h=(await db.query("select id from crm_history where entity='tasks' and after_data is null")).rows[0].id;
  await db.query('select crm_restore_history($1,$2)',[h,crypto.randomUUID()]);assert.equal((await readYear(2027)).tasks[0].title,'2027');assert.equal((await readYear(2026)).tasks[0].title,'Initial');
  await assert.rejects(db.query('select crm_create_edition($1,2027)',[wid]),e=>e.code==='23505');
  await assert.rejects(db.query('select crm_create_edition($1,9999)',[wid]),e=>e.code==='22023');
  await assert.rejects(readYear(2040),/inexistante/);
  await assert.rejects(apply(db,[]),e=>e.code==='55000');
  await db.exec("update crm_members set role='viewer'; set role authenticated;");
  assert.equal((await readYear(2027)).tasks.length,1);
  await assert.rejects(db.query('select crm_create_edition($1,2028)',[wid]),e=>e.code==='42501');
  await assert.rejects(writeYear(2027,[]),e=>e.code==='42501');
 }finally{await db.close();}
});
