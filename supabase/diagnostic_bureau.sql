-- Lecture seule. Exécuter dans le SQL Editor du projet utilisé par LCS Orga.
select current_database() as base,
 to_regclass('public.crm_workspaces') as espaces,
 to_regclass('public.crm_members') as membres,
 to_regclass('public.crm_editions') as editions,
 to_regprocedure('public.crm_has_role(text,text[])') as droits;
select table_schema,table_name from information_schema.tables
 where table_schema not in ('pg_catalog','information_schema') and table_name like '%crm%'
 order by table_schema,table_name;
