-- Exécuter après 018_team_wall.sql.
begin;
create table if not exists public.crm_wall_topics (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 edition_year integer not null,
 name text not null check(length(btrim(name)) between 1 and 80),
 unique(workspace_id,edition_year,id),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year)
);
create unique index if not exists crm_wall_topic_name on public.crm_wall_topics(workspace_id,edition_year,lower(name));
alter table public.crm_wall_topics enable row level security;
revoke all on public.crm_wall_topics from anon,authenticated;
alter table public.crm_wall_messages add column if not exists topic_id uuid;
alter table public.crm_wall_messages add column if not exists mentions jsonb not null default '[]';
alter table public.crm_wall_messages add column if not exists closed_at timestamptz;
alter table public.crm_wall_messages add column if not exists closed_by uuid;
alter table public.crm_wall_messages add column if not exists deleted_at timestamptz;
alter table public.crm_wall_messages add column if not exists deleted_by uuid;
do $$begin
 if not exists(select 1 from pg_constraint where conname='crm_wall_topic_fk' and conrelid='public.crm_wall_messages'::regclass) then
  alter table public.crm_wall_messages add constraint crm_wall_topic_fk foreign key(workspace_id,edition_year,topic_id) references public.crm_wall_topics(workspace_id,edition_year,id);
 end if;
 if to_regprocedure('public.crm_wall_base(uuid,integer,text,jsonb)') is null then
  alter function public.crm_wall(uuid,integer,text,jsonb) rename to crm_wall_base;
 end if;
end;$$;
revoke all on function public.crm_wall_base(uuid,integer,text,jsonb) from public,anon,authenticated;
create or replace function public.crm_wall(p_workspace uuid,p_year integer,p_action text,p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_id uuid; v_parent uuid; v_topic uuid; v_body text; v_mentions jsonb;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_action='read' then
  v_result=public.crm_wall_base(p_workspace,p_year,p_action,p_values);
  return v_result || jsonb_build_object(
   'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from public.crm_wall_messages m where m.workspace_id=p_workspace and m.edition_year=p_year and m.deleted_at is null and (m.parent_id is null or exists(select 1 from public.crm_wall_messages p where p.id=m.parent_id and p.deleted_at is null))),'[]'::jsonb),
   'topics',coalesce((select jsonb_agg(to_jsonb(t) order by lower(t.name),t.id) from public.crm_wall_topics t where t.workspace_id=p_workspace and t.edition_year=p_year),'[]'::jsonb));
 elsif p_action='seen' then return public.crm_wall_base(p_workspace,p_year,p_action,p_values);
 end if;
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then raise exception 'Lecture seule' using errcode='42501'; end if;
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is null) then raise exception 'Édition clôturée ou inconnue' using errcode='42501'; end if;
 v_id=(p_values->>'id')::uuid;
 if p_action in ('topic_save','topic_delete') then
  if p_action='topic_delete' then
   update public.crm_wall_messages set topic_id=null where workspace_id=p_workspace and edition_year=p_year and topic_id=v_id;
   delete from public.crm_wall_topics where workspace_id=p_workspace and edition_year=p_year and id=v_id;
  else
   if length(btrim(coalesce(p_values->>'name',''))) not between 1 and 80 then raise exception 'Nom de thématique invalide'; end if;
   if v_id is null then
    insert into public.crm_wall_topics(workspace_id,edition_year,name) values(p_workspace,p_year,btrim(p_values->>'name'));
   else
    update public.crm_wall_topics set name=btrim(p_values->>'name') where id=v_id and workspace_id=p_workspace and edition_year=p_year;
    if not found then raise exception 'Thématique introuvable'; end if;
   end if;
  end if;
  return '{}';
 elsif p_action in ('delete','close','reopen') then
  if not exists(select 1 from public.crm_wall_messages where id=v_id and workspace_id=p_workspace and edition_year=p_year and deleted_at is null and (author_id=auth.uid() or public.crm_has_role(p_workspace::text,array['admin']))) then raise exception 'Action réservée à l’auteur ou à un administrateur' using errcode='42501'; end if;
  if p_action='delete' then update public.crm_wall_messages set deleted_at=clock_timestamp(),deleted_by=auth.uid() where id=v_id;
  elsif p_action='close' then update public.crm_wall_messages set closed_at=clock_timestamp(),closed_by=auth.uid() where id=v_id;
  else update public.crm_wall_messages set closed_at=null,closed_by=null where id=v_id;
  end if;
  return '{}';
 elsif p_action<>'publish' or p_action is null then raise exception 'Action inconnue'; end if;
 v_parent=(p_values->>'parent_id')::uuid;
 v_topic=(p_values->>'topic_id')::uuid;
 if v_parent is not null then
  select topic_id into v_topic from public.crm_wall_messages where id=v_parent and workspace_id=p_workspace and edition_year=p_year and parent_id is null and deleted_at is null and closed_at is null;
  if not found then raise exception 'Discussion clôturée ou supprimée'; end if;
 end if;
 if v_topic is not null and not exists(select 1 from public.crm_wall_topics where id=v_topic and workspace_id=p_workspace and edition_year=p_year) then raise exception 'Thématique introuvable'; end if;
 v_body=btrim(p_values->>'body');
 select coalesce(jsonb_agg(user_id::text order by user_id),'[]'::jsonb) into v_mentions from public.crm_members where workspace_id=p_workspace and first_name<>'' and position(lower('@['||first_name||']') in lower(v_body))>0;
 if position('@tout le monde' in lower(v_body))>0 then v_mentions=jsonb_build_array('all'); end if;
 if exists(select 1 from public.crm_wall_messages where id=v_id and (topic_id is distinct from v_topic or mentions<>v_mentions)) then raise exception 'Identifiant déjà utilisé'; end if;
 v_result=public.crm_wall_base(p_workspace,p_year,p_action,p_values);
 update public.crm_wall_messages set topic_id=v_topic,mentions=v_mentions where id=(v_result->>'id')::uuid;
 return v_result;
end;$$;
revoke all on function public.crm_wall(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.crm_wall(uuid,integer,text,jsonb) to authenticated;

create table if not exists public.crm_vip_participants (
 id uuid primary key,
 workspace_id uuid not null,
 edition_year integer not null,
 source_key text,
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 version bigint not null default 1,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid not null references auth.users(id),
 unique(workspace_id,edition_year,source_key),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year)
);
alter table public.crm_vip_participants enable row level security;
revoke all on public.crm_vip_participants from anon,authenticated;
create or replace function public.crm_vip(p_workspace uuid,p_year integer,p_action text,p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_id uuid; v_key text; v_existing public.crm_vip_participants%rowtype; v_added integer=0; v_updated integer=0;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then raise exception 'Édition inconnue'; end if;
 if p_action='read' then return coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'version',version) order by lower(payload->>'last'),lower(payload->>'first'),id) from public.crm_vip_participants where workspace_id=p_workspace and edition_year=p_year),'[]'::jsonb); end if;
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then raise exception 'Lecture seule' using errcode='42501'; end if;
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then raise exception 'Édition clôturée' using errcode='42501'; end if;
 if p_action='delete' then
  delete from public.crm_vip_participants where workspace_id=p_workspace and edition_year=p_year and id=(p_values->>'id')::uuid and version=(p_values->>'version')::bigint;
  if not found then raise exception 'Fiche modifiée : actualise la page' using errcode='40001'; end if;
 elsif p_action in ('save','import') then
  if jsonb_typeof(p_values->'records') is distinct from 'array' or jsonb_array_length(p_values->'records') not between 1 and 5000 or (p_action='save' and jsonb_array_length(p_values->'records')<>1) then raise exception 'Import invalide'; end if;
  for v_row in select value from jsonb_array_elements(p_values->'records') loop
   if jsonb_typeof(v_row) is distinct from 'object' or coalesce(v_row->>'kind','') not in ('VIP','Early Access') or length(btrim(coalesce(v_row->>'last','')||coalesce(v_row->>'first',''))) not between 1 and 300 or length(coalesce(v_row->>'email',''))>320 or length(coalesce(v_row->>'returning',''))>1000 or length(coalesce(v_row->>'priority',''))>5000 then raise exception 'Participant invalide'; end if;
   v_id=(v_row->>'id')::uuid; v_key=nullif(v_row->>'sourceKey','');
   if p_action='import' and (v_key is null or length(v_key)>1000) then raise exception 'Clé d’import manquante'; end if;
   v_existing=null;
   if p_action='import' then select * into v_existing from public.crm_vip_participants where workspace_id=p_workspace and edition_year=p_year and source_key=v_key;
   else select * into v_existing from public.crm_vip_participants where workspace_id=p_workspace and edition_year=p_year and id=v_id;
   end if;
   if v_existing.id is not null then
    if p_action='save' and v_existing.version is distinct from (v_row->>'version')::bigint then raise exception 'Fiche modifiée : actualise la page' using errcode='40001'; end if;
    update public.crm_vip_participants set payload=jsonb_build_object('last',v_row->>'last','first',v_row->>'first','email',v_row->>'email','returning',v_row->>'returning','priority',v_row->>'priority','kind',v_row->>'kind'),version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=v_existing.id;
    v_updated=v_updated+1;
   else
    if p_action='save' and v_row ? 'version' then raise exception 'Fiche supprimée : actualise la page' using errcode='40001'; end if;
    insert into public.crm_vip_participants(id,workspace_id,edition_year,source_key,payload,updated_by) values(coalesce(v_id,gen_random_uuid()),p_workspace,p_year,case when p_action='import' then v_key else null end,jsonb_build_object('last',v_row->>'last','first',v_row->>'first','email',v_row->>'email','returning',v_row->>'returning','priority',v_row->>'priority','kind',v_row->>'kind'),auth.uid());
    v_added=v_added+1;
   end if;
  end loop;
 else raise exception 'Action inconnue'; end if;
 return jsonb_build_object('added',v_added,'updated',v_updated);
end;$$;
revoke all on function public.crm_vip(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.crm_vip(uuid,integer,text,jsonb) to authenticated;
commit;
