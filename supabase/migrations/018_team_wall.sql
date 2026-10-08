-- Après 017_backlog_profiles.sql. Aucune donnée existante n’est modifiée.
begin;
create table if not exists public.crm_wall_messages (
 id uuid primary key,
 workspace_id uuid not null references public.crm_workspaces(id),
 edition_year integer not null,
 parent_id uuid,
 author_id uuid not null references auth.users(id),
 author_name text not null,
 created_at timestamptz not null default clock_timestamp(),
 body text not null check(length(btrim(body)) between 1 and 10000),
 linked_kind text check(linked_kind in ('tasks','exhibitors','partners')),
 linked_id text,
 attachments jsonb not null default '[]'::jsonb,
 unique(workspace_id,edition_year,id),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year),
 foreign key(workspace_id,edition_year,parent_id) references public.crm_wall_messages(workspace_id,edition_year,id),
 check((linked_kind is null)=(linked_id is null))
);
create index if not exists crm_wall_messages_feed on public.crm_wall_messages(workspace_id,edition_year,created_at);
create table if not exists public.crm_wall_seen (
 workspace_id uuid not null,
 edition_year integer not null,
 user_id uuid not null references auth.users(id),
 seen_at timestamptz not null,
 primary key(workspace_id,edition_year,user_id),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year)
);
alter table public.crm_wall_messages enable row level security;
alter table public.crm_wall_seen enable row level security;
revoke all on public.crm_wall_messages,public.crm_wall_seen from anon,authenticated;

create or replace function public.crm_wall(p_workspace uuid,p_year integer,p_action text,p_values jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_parent uuid; v_id uuid; v_kind text; v_link text; v_attachments jsonb;
 v_name text; v_exists boolean; v_file jsonb; v_seen timestamptz;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès réservé à l’équipe' using errcode='42501';
 end if;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then
  raise exception 'Édition inconnue';
 end if;
 if p_action='read' then
  return jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.crm_wall_messages m where m.workspace_id=p_workspace and m.edition_year=p_year),'[]'::jsonb),'seen_at',(select s.seen_at from public.crm_wall_seen s where s.workspace_id=p_workspace and s.edition_year=p_year and s.user_id=auth.uid()));
 elsif p_action='seen' then
  v_seen=least((p_values->>'through')::timestamptz,clock_timestamp());
  if v_seen is null then raise exception 'Date de lecture manquante'; end if;
  insert into public.crm_wall_seen values(p_workspace,p_year,auth.uid(),v_seen)
   on conflict(workspace_id,edition_year,user_id) do update set seen_at=greatest(public.crm_wall_seen.seen_at,excluded.seen_at);
  return '{}'::jsonb;
 elsif p_action<>'publish' or p_action is null then
  raise exception 'Action inconnue';
 end if;
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Compte en lecture seule' using errcode='42501';
 end if;
 -- Verrou commun avec la clôture de l’édition.
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then
  raise exception 'Édition clôturée' using errcode='42501';
 end if;
 v_id=(p_values->>'id')::uuid;
 v_parent=(p_values->>'parent_id')::uuid;
 v_kind=nullif(p_values->>'linked_kind',''); v_link=nullif(p_values->>'linked_id','');
 v_attachments=coalesce(p_values->'attachments','[]'::jsonb);
 if v_id is null or length(btrim(coalesce(p_values->>'body',''))) not between 1 and 10000 then raise exception 'Message invalide'; end if;
 -- Une nouvelle tentative réseau ne crée pas de doublon.
 if exists(select 1 from public.crm_wall_messages where id=v_id) then
  if not exists(select 1 from public.crm_wall_messages where id=v_id and workspace_id=p_workspace and edition_year=p_year and author_id=auth.uid() and body=btrim(p_values->>'body') and parent_id is not distinct from v_parent and linked_kind is not distinct from v_kind and linked_id is not distinct from v_link) then raise exception 'Identifiant déjà utilisé'; end if;
  return jsonb_build_object('id',v_id);
 end if;
 if v_parent is not null and not exists(select 1 from public.crm_wall_messages where id=v_parent and workspace_id=p_workspace and edition_year=p_year and parent_id is null) then raise exception 'Publication introuvable'; end if;
 if v_parent is not null and (v_kind is not null or v_link is not null) then raise exception 'Relier la publication, pas la réponse'; end if;
 if (v_kind is null)<>(v_link is null) then raise exception 'Lien incomplet'; end if;
 if v_kind is not null then
  if v_kind not in ('tasks','exhibitors','partners') then raise exception 'Type de lien invalide'; end if;
  execute format('select exists(select 1 from public.%I where workspace_id=$1 and edition_year=$2 and id=$3)','crm_'||v_kind) into v_exists using p_workspace,p_year,v_link;
  if not v_exists then raise exception 'Fiche liée introuvable'; end if;
 end if;
 if jsonb_typeof(v_attachments)<>'array' or jsonb_array_length(v_attachments)>10 then raise exception '10 pièces jointes maximum'; end if;
 for v_file in select value from jsonb_array_elements(v_attachments) loop
  if jsonb_typeof(v_file)<>'object' or coalesce(v_file->>'blobId','') !~ '^[A-Za-z0-9_-]+$' or length(coalesce(v_file->>'fileName','')) not between 1 and 255 or coalesce((v_file->>'size')::bigint,-1) not between 0 and 52428800 then raise exception 'Pièce jointe invalide'; end if;
  if not exists(select 1 from storage.objects where bucket_id='lcs-private' and name=p_workspace::text||'/'||(v_file->>'blobId') and owner_id=auth.uid()::text) then raise exception 'Pièce jointe non autorisée' using errcode='42501'; end if;
 end loop;
 select coalesce(nullif(btrim(first_name),''),'Membre') into v_name from public.crm_members where workspace_id=p_workspace and user_id=auth.uid();
 insert into public.crm_wall_messages(id,workspace_id,edition_year,parent_id,author_id,author_name,body,linked_kind,linked_id,attachments)
 values(v_id,p_workspace,p_year,v_parent,auth.uid(),v_name,btrim(p_values->>'body'),v_kind,v_link,v_attachments);
 return jsonb_build_object('id',v_id);
end;$$;
revoke all on function public.crm_wall(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.crm_wall(uuid,integer,text,jsonb) to authenticated;
commit;
