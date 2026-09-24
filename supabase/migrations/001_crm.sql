-- Exécuter une fois dans le SQL Editor du nouveau projet Supabase.
begin;
create table public.crm_workspaces (
 id uuid primary key default gen_random_uuid(), name text not null,
 created_at timestamptz not null default now()
);
create table public.crm_members (
 workspace_id uuid not null references public.crm_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','editor','viewer')),
 primary key (workspace_id,user_id)
);
create table public.crm_state (
 workspace_id uuid primary key references public.crm_workspaces(id) on delete cascade,
 data jsonb, revision bigint not null default 0,
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
create function public.crm_has_role(w text, roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.crm_members m
 where m.workspace_id::text=w and m.user_id=(select auth.uid()) and m.role=any(roles));
$$;
revoke all on function public.crm_has_role(text,text[]) from public;
grant execute on function public.crm_has_role(text,text[]) to authenticated;
alter table public.crm_workspaces enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_state enable row level security;
revoke all on public.crm_workspaces,public.crm_members,public.crm_state from anon,authenticated;
grant select on public.crm_workspaces,public.crm_members,public.crm_state to authenticated;
create policy workspace_read on public.crm_workspaces for select to authenticated
 using(public.crm_has_role(id::text,array['admin','editor','viewer']));
create policy members_read on public.crm_members for select to authenticated
 using(public.crm_has_role(workspace_id::text,array['admin','editor','viewer']));
create policy state_read on public.crm_state for select to authenticated
 using(public.crm_has_role(workspace_id::text,array['admin','editor','viewer']));
-- Les écritures sont limitées à cette fonction. Aucun accès direct en INSERT/UPDATE/DELETE.
create function public.crm_save_state(p_workspace uuid,p_expected_revision bigint,p_data jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_revision bigint;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Accès en écriture refusé' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' or p_data->>'schema' is distinct from '1' then
  raise exception 'État CRM non valide' using errcode='22023';
 end if;
 update public.crm_state set data=p_data,revision=revision+1,updated_at=now(),updated_by=auth.uid()
 where workspace_id=p_workspace and revision=p_expected_revision returning revision into new_revision;
 if not found then raise exception 'Une autre personne a modifié le CRM' using errcode='40001'; end if;
 return new_revision;
end;$$;
revoke all on function public.crm_save_state(uuid,bigint,jsonb) from public;
grant execute on function public.crm_save_state(uuid,bigint,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit)
 values ('lcs-private','lcs-private',false,52428800);
create policy lcs_files_read on storage.objects for select to authenticated
 using(bucket_id='lcs-private' and public.crm_has_role((storage.foldername(name))[1],array['admin','editor','viewer']));
create policy lcs_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='lcs-private' and public.crm_has_role((storage.foldername(name))[1],array['admin','editor']));
-- Pas d'écrasement ni de suppression depuis le navigateur : les anciens fichiers
-- restent récupérables en cas de conflit. Nettoyage explicite ultérieur par administrateur.
commit;
