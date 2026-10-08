-- Après 016_backlog.sql. Exécuter une fois dans Supabase SQL Editor.
-- Les comptes et tâches sont conservés ; renseigner ensuite les prénoms dans Réglages.
begin;
alter table public.crm_members add column if not exists first_name text not null default '';

drop function if exists public.crm_list_members(uuid);
create function public.crm_list_members(p_workspace uuid)
returns table(member_id uuid,email text,member_role text,first_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then raise exception 'Accès refusé' using errcode='42501'; end if;
 return query select m.user_id,u.email::text,m.role,m.first_name from public.crm_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace order by lower(m.first_name),lower(u.email);
end;$$;
revoke all on function public.crm_list_members(uuid) from public,anon;
grant execute on function public.crm_list_members(uuid) to authenticated;

create or replace function public.crm_save_member_profile(p_workspace uuid,p_email text,p_role text,p_first_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin']) then raise exception 'Action réservée aux administrateurs' using errcode='42501'; end if;
 if p_first_name is null or length(btrim(p_first_name)) not between 1 and 80 or position('@' in p_first_name)>0 then raise exception 'Indique un prénom de 1 à 80 caractères' using errcode='22023'; end if;
 perform public.crm_set_member(p_workspace,p_email,p_role,false);
 update public.crm_members m set first_name=btrim(p_first_name) from auth.users u where m.workspace_id=p_workspace and m.user_id=u.id and lower(u.email)=lower(btrim(p_email));
end;$$;
revoke all on function public.crm_save_member_profile(uuid,text,text,text) from public,anon;
grant execute on function public.crm_save_member_profile(uuid,text,text,text) to authenticated;

create or replace function public.crm_read_owners(p_workspace uuid)
returns text[] language plpgsql stable security definer set search_path='' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then raise exception 'Accès refusé' using errcode='42501'; end if;
 return coalesce((select array_agg(distinct m.first_name order by m.first_name) from public.crm_members m where m.workspace_id=p_workspace and m.role in ('admin','editor') and btrim(m.first_name)<>''),array[]::text[]);
end;$$;
revoke all on function public.crm_read_owners(uuid) from public,anon;
grant execute on function public.crm_read_owners(uuid) to authenticated;

create or replace function public.crm_guard_backlog()
returns trigger language plpgsql security definer set search_path='' as $$
declare admin boolean; oldp jsonb; nextp jsonb; target text; column_owner text; claiming boolean; actor text; operation text; comment jsonb; previous_comment jsonb;
begin
 -- Autorise les opérations SQL de migration sans session ; aucun accès direct accordé aux clients.
 if auth.uid() is null then return coalesce(new,old); end if;
 if not public.crm_has_role(coalesce(new.workspace_id,old.workspace_id)::text,array['admin','editor']) then
  raise exception 'Lecture seule' using errcode='42501'; end if;
 admin:=public.crm_has_role(coalesce(new.workspace_id,old.workspace_id)::text,array['admin']);
 oldp:=case when tg_op='INSERT' then null else old.payload end;
 nextp:=case when tg_op='DELETE' then null else new.payload end;
 operation:=tg_op;
 if tg_op='INSERT' then
  if tg_table_name='crm_tasks' then
   select payload into oldp from public.crm_tasks where workspace_id=new.workspace_id and edition_year=new.edition_year and id=new.id;
  else
   select payload into oldp from public.crm_settings where workspace_id=new.workspace_id and edition_year=new.edition_year and id=new.id;
  end if;
  if oldp is not null then operation:='UPDATE'; end if;
 end if;
 actor:=auth.uid()::text;
 if tg_table_name='crm_settings' then
  if oldp->'taskOverdueColor' is distinct from nextp->'taskOverdueColor' then
   if not admin then raise exception 'Seul un administrateur peut modifier la couleur des retards' using errcode='42501'; end if;
   if coalesce(nextp->>'taskOverdueColor','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Couleur invalide'; end if;
  end if;
  if oldp->'taskColumns' is distinct from nextp->'taskColumns' then
   if not admin then raise exception 'Seul un administrateur peut modifier les colonnes' using errcode='42501'; end if;
   if nextp->'taskColumns' is null or jsonb_typeof(nextp->'taskColumns')<>'array' then raise exception 'Colonnes invalides'; end if;
   if jsonb_array_length(nextp->'taskColumns')>50 then raise exception '50 colonnes maximum'; end if;
   if (select count(*) from jsonb_array_elements(nextp->'taskColumns'))<>(select count(distinct value->>'id') from jsonb_array_elements(nextp->'taskColumns')) then raise exception 'Identifiants de colonnes dupliqués'; end if;
   if not exists(select 1 from jsonb_array_elements(nextp->'taskColumns') c where c->>'id'='backlog' and coalesce(c->>'assigneeId','')='') then raise exception 'Le backlog commun est obligatoire'; end if;
   if exists(select 1 from jsonb_array_elements(nextp->'taskColumns') c where coalesce(c->>'id','')='' or length(c->>'id')>100 or coalesce(trim(c->>'title'),'')='' or length(c->>'title')>80 or (coalesce(c->>'assigneeId','')<>'' and not exists(select 1 from public.crm_members m where m.workspace_id=new.workspace_id and m.user_id::text=c->>'assigneeId' and m.role in ('admin','editor')))) then raise exception 'Colonne ou compte invalide'; end if;
   if exists(select 1 from public.crm_tasks t where t.workspace_id=new.workspace_id and t.edition_year=new.edition_year and coalesce(t.payload->>'columnId','')<>'' and not exists(select 1 from jsonb_array_elements(nextp->'taskColumns') c where c->>'id'=t.payload->>'columnId' and coalesce(c->>'assigneeId','') in ('',coalesce(t.payload->>'assigneeId','')))) then raise exception 'Déplace les cartes avant de supprimer ou réattribuer une colonne'; end if;
  end if;
  return coalesce(new,old);
 end if;
 if not admin then
  if operation='INSERT' then
   if coalesce(nextp->>'createdBy','')<>actor then raise exception 'Créateur invalide' using errcode='42501'; end if;
  else
   claiming:=coalesce(oldp->>'assigneeId','')='' and coalesce(oldp->>'owner','')='' and nextp->>'assigneeId'=actor;
   if oldp->>'assigneeId' is distinct from actor and not (coalesce(oldp->>'assigneeId','')='' and coalesce(oldp->>'owner','')='' and oldp->>'createdBy'=actor) then
    if not claiming or (oldp-array['assigneeId','owner','columnId','rank','status']) is distinct from (nextp-array['assigneeId','owner','columnId','rank','status']) or coalesce(nextp->>'status','À faire') not in ('À faire','En cours','En attente') then
     raise exception 'Tu peux modifier uniquement tes tâches ou prendre une tâche non attribuée' using errcode='42501'; end if;
   end if;
   if oldp->'createdBy' is distinct from nextp->'createdBy' and operation<>'DELETE' then raise exception 'Créateur non modifiable' using errcode='42501'; end if;
  end if;
  if nextp is not null then
   if coalesce(nextp->>'assigneeId','') not in ('',actor) or (coalesce(nextp->>'assigneeId','')='' and coalesce(nextp->>'owner','')<>'') then raise exception 'Attribution réservée à ton compte' using errcode='42501'; end if;
  end if;
 end if;
 if nextp is not null then
  if nextp ? 'comments' then
   if jsonb_typeof(nextp->'comments')<>'array' then raise exception 'Commentaires invalides'; end if;
   if (select count(*) from jsonb_array_elements(nextp->'comments'))<>(select count(distinct value->>'id') from jsonb_array_elements(nextp->'comments')) then raise exception 'Identifiants de commentaires invalides'; end if;
   for comment in select value from jsonb_array_elements(nextp->'comments') loop
    select value into previous_comment from jsonb_array_elements(coalesce(oldp->'comments','[]'::jsonb)) where value->>'id'=comment->>'id';
    if previous_comment is null then
     if comment->>'authorId' is distinct from actor or not exists(select 1 from public.crm_members m where m.workspace_id=new.workspace_id and m.user_id::text=actor and coalesce(nullif(m.first_name,''),'Prénom à renseigner')=comment->>'author') then raise exception 'Auteur du commentaire invalide' using errcode='42501'; end if;
     if coalesce(btrim(comment->>'text'),'')='' or coalesce(comment->>'createdAt','')='' or (comment->>'createdAt')::timestamptz not between now()-interval '10 minutes' and now()+interval '1 minute' then raise exception 'Commentaire ou horodatage invalide'; end if;
    elsif (previous_comment-array['text']) is distinct from (comment-array['text']) then raise exception 'Auteur et horodatage non modifiables' using errcode='42501'; end if;
   end loop;
  end if;
  target:=coalesce(nextp->>'assigneeId','');
  if target<>'' and not exists(select 1 from public.crm_members where workspace_id=new.workspace_id and user_id::text=target and role in ('admin','editor')) then raise exception 'Compte responsable invalide'; end if;
  if coalesce(nextp->>'columnId','')<>'' then
   column_owner:=public.crm_task_column_account(new.workspace_id,new.edition_year,nextp->>'columnId');
   if column_owner<>'' and target<>column_owner then raise exception 'La carte doit appartenir au compte de cette colonne'; end if;
  end if;
  if nextp->>'status'='Terminée' and (oldp->>'status' is distinct from 'Terminée' or oldp->'completedAt' is distinct from nextp->'completedAt' or oldp->'completedBy' is distinct from nextp->'completedBy' or oldp->'completedActorId' is distinct from nextp->'completedActorId' or oldp->'completedByLabel' is distinct from nextp->'completedByLabel') then
   if nextp->>'completedActorId' is distinct from actor or coalesce(nextp->>'completedAt','')='' then raise exception 'Trace de réalisation invalide'; end if;
   if (nextp->>'completedAt')::timestamptz not between now()-interval '10 minutes' and now()+interval '1 minute' then raise exception 'Date de réalisation invalide'; end if;
   if not admin and nextp->>'completedBy' is distinct from actor then raise exception 'Tu peux valider uniquement ta propre réalisation' using errcode='42501'; end if;
   if not exists(select 1 from public.crm_members where workspace_id=new.workspace_id and user_id::text=nextp->>'completedBy' and role in ('admin','editor')) then raise exception 'Compte de réalisation invalide'; end if;
   if not exists(select 1 from public.crm_members m where m.workspace_id=new.workspace_id and m.user_id::text=nextp->>'completedBy' and coalesce(nullif(m.first_name,''),'Prénom à renseigner')=nextp->>'completedByLabel') then raise exception 'Libellé de réalisation invalide'; end if;
  elsif nextp->>'status' is distinct from 'Terminée' and (nextp ? 'completedAt' or nextp ? 'completedBy' or nextp ? 'completedActorId') then
   -- Le formulaire utilise un champ vide pour le choix du réalisateur.
   if coalesce(nextp->>'completedAt','')<>'' or coalesce(nextp->>'completedBy','')<>'' or coalesce(nextp->>'completedActorId','')<>'' then raise exception 'Une tâche ouverte ne peut pas avoir de réalisation'; end if;
  end if;
 end if;
 return coalesce(new,old);
end;$$;
revoke all on function public.crm_guard_backlog() from public,anon,authenticated;
drop trigger if exists crm_tasks_backlog_guard on public.crm_tasks;
create trigger crm_tasks_backlog_guard before insert or update or delete on public.crm_tasks for each row execute function public.crm_guard_backlog();
drop trigger if exists crm_settings_backlog_guard on public.crm_settings;
create trigger crm_settings_backlog_guard before insert or update or delete on public.crm_settings for each row execute function public.crm_guard_backlog();
commit;
