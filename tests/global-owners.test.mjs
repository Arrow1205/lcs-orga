import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/007_global_owners.sql',import.meta.url),'utf8');
const workspace='10000000-0000-0000-0000-000000000001',admin='00000000-0000-0000-0000-000000000001',viewer='00000000-0000-0000-0000-000000000002';
test('responsables globaux : migration, années, droits et ajout sans doublon',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.crm_workspaces(id uuid primary key,name text);
   create table public.crm_members(workspace_id uuid,user_id uuid,role text);
   create table public.crm_settings(workspace_id uuid,edition_year integer,id text,payload jsonb);
   create function public.crm_has_role(w text,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.crm_members m where m.workspace_id::text=w and m.user_id=auth.uid() and m.role=any(roles))$$;
   insert into crm_workspaces values('${workspace}','Salon');
   insert into crm_members values('${workspace}','${admin}','admin'),('${workspace}','${viewer}','viewer');
   insert into crm_settings values('${workspace}',2026,'main','{"owners":["Alice","Bob"]}'),('${workspace}',2027,'main','{"owners":["Bob","Chloé"]}');
   select set_config('request.jwt.claim.sub','${admin}',false);`);
  await db.exec(sql);
  await db.exec('set role authenticated');
  const read=async()=> (await db.query('select crm_read_owners($1) as owners',[workspace])).rows[0].owners;
  assert.deepEqual(await read(),['Alice','Bob','Chloé']);
  await db.query('select crm_change_owner($1,$2,false)',[workspace,'alice']);
  assert.deepEqual(await read(),['Alice','Bob','Chloé']);
  await db.query('select crm_change_owner($1,$2,false)',[workspace,'Dina']);
  assert.deepEqual(await read(),['Alice','Bob','Chloé','Dina']);
  await db.query('select crm_change_owner($1,$2,true)',[workspace,'BOB']);
  assert.deepEqual(await read(),['Alice','Chloé','Dina']);
  await assert.rejects(db.exec(`update crm_global_settings set owners=array['pirate']`),e=>e.code==='42501');
  await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${viewer}',false); set role authenticated`);
  assert.deepEqual(await read(),['Alice','Chloé','Dina']);
  await assert.rejects(db.query('select crm_change_owner($1,$2,false)',[workspace,'Eve']),e=>e.code==='42501');
 }finally{await db.close()}
});
