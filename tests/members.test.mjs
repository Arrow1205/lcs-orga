import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/006_members.sql',import.meta.url),'utf8');
const workspace='10000000-0000-0000-0000-000000000001',admin='00000000-0000-0000-0000-000000000001',user='00000000-0000-0000-0000-000000000002';
test('gestion des membres : accès administrateur, rôle et retrait',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.crm_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
   create function public.crm_has_role(w text, roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.crm_members m where m.workspace_id::text=w and m.user_id=auth.uid() and m.role=any(roles))$$;
   insert into auth.users values('${admin}','admin@example.test'),('${user}','member@example.test');
   insert into crm_members values('${workspace}','${admin}','admin');
   select set_config('request.jwt.claim.sub','${admin}',false);`);
  await db.exec(sql);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select * from crm_list_members($1)',[workspace])).rows.length,1);
  await db.query('select crm_set_member($1,$2,$3,false)',[workspace,'member@example.test','editor']);
  assert.equal((await db.query('select * from crm_list_members($1)',[workspace])).rows.length,2);
  await assert.rejects(db.query('select crm_set_member($1,$2,$3,true)',[workspace,'admin@example.test','admin']),e=>e.code==='22023');
  await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
  assert.equal((await db.query('select * from crm_list_members($1)',[workspace])).rows.length,2);
  await assert.rejects(db.query('select crm_set_member($1,$2,$3,true)',[workspace,'admin@example.test','admin']),e=>e.code==='42501');
  await db.exec('reset role');await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated`);
  await db.query('select crm_set_member($1,$2,$3,true)',[workspace,'member@example.test','editor']);
  assert.equal((await db.query('select * from crm_list_members($1)',[workspace])).rows.length,1);
 }finally{await db.close()}
});
