-- Exécuter une fois dans le SQL Editor du projet Supabase relié à Vercel.
-- La migration réunit les responsables de toutes les éditions existantes.
begin;
create table if not exists public.crm_global_settings (
 workspace_id uuid primary key references public.crm_workspaces(id) on delete cascade,
 owners text[] not null default array[]::text[],
 updated_at timestamptz not null default now()
);
alter table public.crm_global_settings enable row level security;
revoke all on public.crm_global_settings from anon,authenticated;

insert into public.crm_global_settings(workspace_id,owners)
select w.id,coalesce((
 select array_agg(distinct btrim(v.name) order by btrim(v.name))
 from public.crm_settings s
 cross join lateral jsonb_array_elements_text(
  case when jsonb_typeof(s.payload->'owners')='array' then s.payload->'owners' else '[]'::jsonb end
 ) as v(name)
 where s.workspace_id=w.id and btrim(v.name)<>''
),array[]::text[])
from public.crm_workspaces w
on conflict (workspace_id) do nothing;

create or replace function public.crm_read_owners(p_workspace uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 return coalesce((select owners from public.crm_global_settings where workspace_id=p_workspace),array[]::text[]);
end;
$$;
revoke all on function public.crm_read_owners(uuid) from public,anon;
grant execute on function public.crm_read_owners(uuid) to authenticated;

create or replace function public.crm_change_owner(p_workspace uuid,p_name text,p_remove boolean default false)
returns text[] language plpgsql security definer set search_path = '' as $$
declare current_owners text[];
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Accès en écriture refusé' using errcode='42501';
 end if;
 if p_name is null or length(btrim(p_name))=0 or length(btrim(p_name))>120 then
  raise exception 'Indique un nom de 1 à 120 caractères' using errcode='22023';
 end if;
 insert into public.crm_global_settings(workspace_id) values(p_workspace)
 on conflict (workspace_id) do nothing;
 select owners into current_owners from public.crm_global_settings
 where workspace_id=p_workspace for update;
 if p_remove then
  select coalesce(array_agg(v order by ord),array[]::text[]) into current_owners
  from unnest(current_owners) with ordinality as t(v,ord)
  where lower(v)<>lower(btrim(p_name));
 elsif not exists(select 1 from unnest(current_owners) as v where lower(v)=lower(btrim(p_name))) then
  current_owners:=array_append(current_owners,btrim(p_name));
 end if;
 update public.crm_global_settings set owners=current_owners,updated_at=now()
 where workspace_id=p_workspace;
 return current_owners;
end;
$$;
revoke all on function public.crm_change_owner(uuid,text,boolean) from public,anon;
grant execute on function public.crm_change_owner(uuid,text,boolean) to authenticated;
commit;
