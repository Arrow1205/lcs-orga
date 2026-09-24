from pathlib import Path
root=Path(__file__).resolve().parents[1];old=(root/'supabase/migrations/002_records.sql').read_text()
annual=['exhibitors','partners','tasks','posts','expenses','ideas','assets','invoices','zones','settings','forecast','metadata']
s='''-- Après 002_records.sql ; une seule fois. Toutes les données existantes deviennent LCS 2026.
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
'''
for t in annual:
 s+=f'''alter table public.crm_{t} add column edition_year integer not null default 2026;
alter table public.crm_{t} drop constraint crm_{t}_pkey;
alter table public.crm_{t} add primary key(workspace_id,edition_year,id);
alter table public.crm_{t} add foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year);
alter table public.crm_{t} alter column edition_year drop default;
'''
s+='''alter table public.crm_history add column edition_year integer not null default 2026;
alter table public.crm_requests add column edition_year integer not null default 2026;
alter table public.crm_requests drop constraint crm_requests_pkey;
alter table public.crm_requests add primary key(workspace_id,edition_year,request_id);
'''
read=old[old.index('create function public.crm_read_records'):old.index('-- Une transaction')]
read=read.replace('p_workspace uuid)', 'p_workspace uuid,p_year integer)')
read=read.replace('crm_read_records(uuid)', 'crm_read_records(uuid,integer)')
read=read.replace("select revision into rev", "if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then raise exception 'Année inexistante'; end if;\n select revision into rev")
read=read.replace("and id='main'", "and edition_year=p_year and id='main'").replace("and id='2027'", "and edition_year=p_year and id='2027'")
read=read.replace("where workspace_id=$1','crm_'||entity)", "where workspace_id=$1 %s','crm_'||entity,case when entity='contacts' then '' else 'and edition_year=$2' end)").replace('into part using p_workspace;', 'into part using p_workspace,p_year;')
s+=read
apply=old[old.index('create function public.crm_apply_changes'):old.index('-- Reprise exclusive')]
apply=apply.replace('p_changes jsonb)', 'p_changes jsonb,p_year integer)').replace('crm_apply_changes(uuid,uuid,jsonb)', 'crm_apply_changes(uuid,uuid,jsonb,integer)')
apply=apply.replace("seen text[]:='{}';", "scope text; seen text[]:='{}';")
apply=apply.replace("-- Sérialiser", "if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then raise exception 'Année inexistante'; end if;\n -- Sérialiser")
apply=apply.replace('and request_id=p_request','and edition_year=p_year and request_id=p_request')
apply=apply.replace("current_data:=null;", "scope:=case when entity='contacts' then '' else ' and edition_year=$5' end;\n  current_data:=null;")
apply=apply.replace("where workspace_id=$1 and id=$2','crm_'||entity) into current_data using p_workspace,key;", "where workspace_id=$1 and id=$2 %s','crm_'||entity,scope) into current_data using p_workspace,key,after_value,auth.uid(),p_year;")
apply=apply.replace('before_data,after_data,changed_by)', 'before_data,after_data,changed_by,edition_year)').replace('current_data,after_value,auth.uid());','current_data,after_value,auth.uid(),p_year);')
apply=apply.replace("where workspace_id=$1 and id=$2','crm_'||entity) using p_workspace,key;", "where workspace_id=$1 and id=$2 %s','crm_'||entity,scope) using p_workspace,key,after_value,auth.uid(),p_year;")
needle="   execute format('insert into public.%I(workspace_id,id,payload,updated_by)"
a=apply.index(needle);b=apply.index('\n  end if;',a)
apply=apply[:a]+'''   if entity='contacts' then
    insert into public.crm_contacts(workspace_id,id,payload,updated_by) values(p_workspace,key,after_value,auth.uid())
    on conflict(workspace_id,id) do update set payload=excluded.payload,version=crm_contacts.version+1,updated_at=now(),updated_by=excluded.updated_by;
   else
    execute format('insert into public.%I(workspace_id,id,payload,updated_by,edition_year) values($1,$2,$3,$4,$5) on conflict(workspace_id,edition_year,id) do update set payload=excluded.payload,version=%I.version+1,updated_at=now(),updated_by=excluded.updated_by','crm_'||entity,'crm_'||entity) using p_workspace,key,after_value,auth.uid(),p_year;
   end if;'''+apply[b:]
apply=apply.replace('request_id,changes,revision) values(p_workspace,p_request,p_changes,rev)', 'request_id,changes,revision,edition_year) values(p_workspace,p_request,p_changes,rev,p_year)')
s+=apply
restore=old[old.index('create function public.crm_restore_history'):old.index('-- Empêcher un ancien')]
restore=restore.replace('create function','create or replace function').replace("'after',h.before_data)));", "'after',h.before_data)),h.edition_year);")
s+=restore
s+='''-- Les nouveaux millésimes démarrent sans fiche ni valeur reprise des précédents.
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
'''
(root/'supabase/migrations/003_editions.sql').write_text(s)
