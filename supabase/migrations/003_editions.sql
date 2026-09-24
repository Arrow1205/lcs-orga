-- Après 002_records.sql ; une seule fois. Toutes les données existantes deviennent LCS 2026.
begin;
lock table public.crm_v2_status in access exclusive mode;
create table public.crm_editions (
 workspace_id uuid not null references public.crm_workspaces(id),
 year integer not null check(year between 2000 and 2200),
 created_at timestamptz not null default now(), created_by uuid references auth.users(id),
 primary key(workspace_id,year)
);
insert into public.crm_editions(workspace_id,year) select workspace_id,2026 from public.crm_v2_status;
alter table public.crm_editions enable row level security;
revoke all on public.crm_editions from anon,authenticated;
grant select on public.crm_editions to authenticated;
create policy member_read on public.crm_editions for select to authenticated
using(public.crm_has_role(workspace_id::text,array['admin','editor','viewer']));
alter table public.crm_exhibitors add column edition_year integer not null default 2026;
alter table public.crm_exhibitors drop constraint crm_exhibitors_pkey;
alter table public.crm_exhibitors add primary key(workspace_id,edition_year,id);
alter table public.crm_exhibitors add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_exhibitors alter column edition_year drop default;
alter table public.crm_partners add column edition_year integer not null default 2026;
alter table public.crm_partners drop constraint crm_partners_pkey;
alter table public.crm_partners add primary key(workspace_id,edition_year,id);
alter table public.crm_partners add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_partners alter column edition_year drop default;
alter table public.crm_tasks add column edition_year integer not null default 2026;
alter table public.crm_tasks drop constraint crm_tasks_pkey;
alter table public.crm_tasks add primary key(workspace_id,edition_year,id);
alter table public.crm_tasks add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_tasks alter column edition_year drop default;
alter table public.crm_posts add column edition_year integer not null default 2026;
alter table public.crm_posts drop constraint crm_posts_pkey;
alter table public.crm_posts add primary key(workspace_id,edition_year,id);
alter table public.crm_posts add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_posts alter column edition_year drop default;
alter table public.crm_expenses add column edition_year integer not null default 2026;
alter table public.crm_expenses drop constraint crm_expenses_pkey;
alter table public.crm_expenses add primary key(workspace_id,edition_year,id);
alter table public.crm_expenses add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_expenses alter column edition_year drop default;
alter table public.crm_ideas add column edition_year integer not null default 2026;
alter table public.crm_ideas drop constraint crm_ideas_pkey;
alter table public.crm_ideas add primary key(workspace_id,edition_year,id);
alter table public.crm_ideas add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_ideas alter column edition_year drop default;
alter table public.crm_assets add column edition_year integer not null default 2026;
alter table public.crm_assets drop constraint crm_assets_pkey;
alter table public.crm_assets add primary key(workspace_id,edition_year,id);
alter table public.crm_assets add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_assets alter column edition_year drop default;
alter table public.crm_invoices add column edition_year integer not null default 2026;
alter table public.crm_invoices drop constraint crm_invoices_pkey;
alter table public.crm_invoices add primary key(workspace_id,edition_year,id);
alter table public.crm_invoices add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_invoices alter column edition_year drop default;
alter table public.crm_zones add column edition_year integer not null default 2026;
alter table public.crm_zones drop constraint crm_zones_pkey;
alter table public.crm_zones add primary key(workspace_id,edition_year,id);
alter table public.crm_zones add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_zones alter column edition_year drop default;
alter table public.crm_settings add column edition_year integer not null default 2026;
alter table public.crm_settings drop constraint crm_settings_pkey;
alter table public.crm_settings add primary key(workspace_id,edition_year,id);
alter table public.crm_settings add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_settings alter column edition_year drop default;
alter table public.crm_forecast add column edition_year integer not null default 2026;
alter table public.crm_forecast drop constraint crm_forecast_pkey;
alter table public.crm_forecast add primary key(workspace_id,edition_year,id);
alter table public.crm_forecast add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_forecast alter column edition_year drop default;
alter table public.crm_metadata add column edition_year integer not null default 2026;
alter table public.crm_metadata drop constraint crm_metadata_pkey;
alter table public.crm_metadata add primary key(workspace_id,edition_year,id);
alter table public.crm_metadata add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_metadata alter column edition_year drop default;
alter table public.crm_history add column edition_year integer not null default 2026;
alter table public.crm_requests add column edition_year integer not null default 2026;
alter table public.crm_requests drop constraint crm_requests_pkey;
alter table public.crm_requests add primary key(workspace_id,edition_year,request_id);
create function public.crm_read_records(p_workspace uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='{}'; part jsonb; entity text; rev bigint;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès refusé' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then raise exception 'Année inexistante'; end if;
 select revision into rev from public.crm_v2_status where workspace_id=p_workspace;
 if not found then raise exception 'Migration V2 non exécutée pour cet espace'; end if;
 select payload into result from public.crm_metadata where workspace_id=p_workspace and edition_year=p_year and id='main';
 result:=coalesce(result,'{}');
 foreach entity in array array['exhibitors','contacts','partners','tasks','posts','expenses','ideas','assets','invoices','zones'] loop
  execute format('select coalesce(jsonb_agg(payload order by position,id),''[]''::jsonb) from public.%I where workspace_id=$1 %s','crm_'||entity,case when entity='contacts' then '' else 'and edition_year=$2' end) into part using p_workspace,p_year;
  result:=jsonb_set(result,array[entity],part);
 end loop;
 select payload into part from public.crm_settings where workspace_id=p_workspace and edition_year=p_year and id='main';
 result:=jsonb_set(result,'{settings}',coalesce(part,'{}'));
 select payload into part from public.crm_forecast where workspace_id=p_workspace and edition_year=p_year and id='2027';
 result:=jsonb_set(result,'{forecast2027}',coalesce(part,'{}'));
 return jsonb_build_object('revision',rev,'data',result);
end;$$;
revoke all on function public.crm_read_records(uuid,integer) from public;
grant execute on function public.crm_read_records(uuid,integer) to authenticated;

create function public.crm_apply_changes(p_workspace uuid,p_request uuid,p_changes jsonb,p_year integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare change jsonb; entity text; key text; current_data jsonb;
 before_value jsonb; after_value jsonb; rev bigint; prior jsonb; scope text; seen text[]:='{}'; token text;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Accès en écriture refusé' using errcode='42501'; end if;
 if p_request is null or jsonb_typeof(p_changes) is distinct from 'array' then
  raise exception 'Requête invalide' using errcode='22023'; end if;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then raise exception 'Année inexistante'; end if;
 -- Sérialiser la courte transaction, sans comparer la révision globale.
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 if not found then raise exception 'Migration V2 non exécutée'; end if;
 select changes,revision into prior,rev from public.crm_requests where workspace_id=p_workspace and edition_year=p_year and request_id=p_request;
 if found then
  if prior is distinct from p_changes then raise exception 'UUID de requête réutilisé' using errcode='22023'; end if;
  return rev;
 end if;
 for change in select value from jsonb_array_elements(p_changes) loop
  entity:=change->>'entity'; key:=change->>'id';
  if entity is null or not(entity=any(array['exhibitors','contacts','partners','tasks','posts','expenses','ideas','assets','invoices','zones','settings','forecast','metadata'])) or key is null or key='' then raise exception 'Table ou identifiant invalide' using errcode='22023'; end if;
  token:=entity||':'||key;
  if token=any(seen) then raise exception 'Fiche répétée dans la requête' using errcode='22023'; end if;
  seen:=array_append(seen,token);
  if not(change ? 'before') or not(change ? 'after') then raise exception 'Version manquante' using errcode='22023'; end if;
  before_value:=nullif(change->'before','null'::jsonb);
  after_value:=nullif(change->'after','null'::jsonb);
  if after_value is not null and jsonb_typeof(after_value)<>'object' then raise exception 'Fiche invalide' using errcode='22023'; end if;
  if entity in ('settings','metadata') and key<>'main' or entity='forecast' and key<>'2027' then raise exception 'Identifiant de réglage invalide'; end if;
  if entity=any(array['exhibitors','contacts','partners','tasks','posts','expenses','ideas','assets','invoices','zones']) and after_value is not null and after_value->>'id' is distinct from key then raise exception 'Identifiant incohérent'; end if;
  if entity='metadata' and (after_value is null or after_value->>'schema' is distinct from '1') then raise exception 'Schéma CRM invalide'; end if;
  scope:=case when entity='contacts' then '' else ' and edition_year=$5' end;
  current_data:=null;
  execute format('select payload from public.%I where workspace_id=$1 and id=$2 %s','crm_'||entity,scope) into current_data using p_workspace,key,after_value,auth.uid(),p_year;
  if current_data is distinct from before_value then
   raise exception 'Conflit sur % / % : recharge la fiche avant de réessayer',entity,key using errcode='40001';
  end if;
  if current_data is not distinct from after_value then continue; end if;
  insert into public.crm_history(workspace_id,entity,record_id,before_data,after_data,changed_by,edition_year)
   values(p_workspace,entity,key,current_data,after_value,auth.uid(),p_year);
  if after_value is null then
   execute format('delete from public.%I where workspace_id=$1 and id=$2 %s','crm_'||entity,scope) using p_workspace,key,after_value,auth.uid(),p_year;
  else
   if entity='contacts' then
    insert into public.crm_contacts(workspace_id,id,payload,updated_by) values(p_workspace,key,after_value,auth.uid())
    on conflict(workspace_id,id) do update set payload=excluded.payload,version=crm_contacts.version+1,updated_at=now(),updated_by=excluded.updated_by;
   else
    execute format('insert into public.%I(workspace_id,id,payload,updated_by,edition_year) values($1,$2,$3,$4,$5) on conflict(workspace_id,edition_year,id) do update set payload=excluded.payload,version=%I.version+1,updated_at=now(),updated_by=excluded.updated_by','crm_'||entity,'crm_'||entity) using p_workspace,key,after_value,auth.uid(),p_year;
   end if;
  end if;
 end loop;
 update public.crm_v2_status set revision=revision+1 where workspace_id=p_workspace returning revision into rev;
 insert into public.crm_requests(workspace_id,request_id,changes,revision,edition_year) values(p_workspace,p_request,p_changes,rev,p_year);
 return rev;
end;$$;
revoke all on function public.crm_apply_changes(uuid,uuid,jsonb,integer) from public;
grant execute on function public.crm_apply_changes(uuid,uuid,jsonb,integer) to authenticated;

create or replace function public.crm_restore_history(p_history bigint,p_request uuid)
returns bigint language plpgsql security definer set search_path='' as $$
declare h public.crm_history;
begin
 select * into h from public.crm_history where id=p_history;
 if not found or not public.crm_has_role(h.workspace_id::text,array['admin']) then
  raise exception 'Restauration réservée aux administrateurs' using errcode='42501'; end if;
 return public.crm_apply_changes(h.workspace_id,p_request,jsonb_build_array(jsonb_build_object(
  'entity',h.entity,'id',h.record_id,'before',h.after_data,'after',h.before_data)),h.edition_year);
end;$$;
revoke all on function public.crm_restore_history(bigint,uuid) from public;
grant execute on function public.crm_restore_history(bigint,uuid) to authenticated;
-- Les nouveaux millésimes démarrent sans fiche ni valeur reprise des précédents.
create function public.crm_create_edition(p_workspace uuid,p_year integer) returns integer
language plpgsql security definer set search_path='' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_year is null or p_year<2000 or p_year>2200 then raise exception 'Année invalide' using errcode='22023'; end if;
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 if not found then raise exception 'Espace non initialisé'; end if;
 insert into public.crm_editions(workspace_id,year,created_by) values(p_workspace,p_year,auth.uid());
 insert into public.crm_metadata(workspace_id,edition_year,id,payload) values(p_workspace,p_year,'main','{"schema":1,"contactSplitVersion":1}');
 insert into public.crm_settings(workspace_id,edition_year,id,payload) values(p_workspace,p_year,'main','{"score":[70,30,20],"totalTables":0,"owners":[],"accent":"#1303E3","dark":false,"partnerSqmPrice":0,"partnerTablePrice":0}');
 insert into public.crm_forecast(workspace_id,edition_year,id,payload) values(p_workspace,p_year,'2027','{"totalTables":0,"proTables":0,"collectorTables":0,"partnerTables":0,"proPrice":0,"collectorPrice":0,"area":0,"priceSqm":0,"partnerTablePrice":0,"hallRental":0,"deco":0,"social":0,"press":0,"extraRevenue":[],"extraExpense":[],"modelVersion":2,"revenueModelVersion":3}');
 insert into public.crm_zones(workspace_id,edition_year,id,payload)
 select p_workspace,p_year,v->>'id',v from jsonb_array_elements('[{"id":"basket","name":"Basket","capacity":0,"color":"#f96927"},{"id":"soccer","name":"Soccer","capacity":0,"color":"#22b55f"},{"id":"sports-us","name":"Sports US","capacity":0,"color":"#25b9c7"},{"id":"tcg","name":"TCG","capacity":0,"color":"#e0b726"}]'::jsonb) v;
 update public.crm_v2_status set revision=revision+1 where workspace_id=p_workspace;
 return p_year;
end;$$;
revoke all on function public.crm_create_edition(uuid,integer) from public;
grant execute on function public.crm_create_edition(uuid,integer) to authenticated;
-- Refuser les appels des anciens clients sans année explicite.
create or replace function public.crm_read_records(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin raise exception 'Recharge la nouvelle version multi-années du CRM.' using errcode='55000'; end;$$;
create or replace function public.crm_apply_changes(p_workspace uuid,p_request uuid,p_changes jsonb) returns bigint
language plpgsql security definer set search_path='' as $$ begin raise exception 'Recharge la nouvelle version multi-années du CRM.' using errcode='55000'; end;$$;
commit;
