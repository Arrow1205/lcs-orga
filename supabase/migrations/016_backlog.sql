-- Après les migrations 001 à 015. À exécuter dans Supabase SQL Editor.
-- Conserve les tâches et responsables historiques ; attribution aux comptes sans rapprochement automatique.
begin;
create or replace function public.crm_task_column_account(w uuid,y integer,k text)
returns text language plpgsql stable security definer set search_path='' as $$
declare cols jsonb; col jsonb; member text;
begin
 select payload->'taskColumns' into cols from public.crm_settings where workspace_id=w and edition_year=y and id='main';
 if cols is null then
  if k in ('backlog','progress','done') then return ''; end if;
  if k like 'member-%' then
   member:=substr(k,8);
   if exists(select 1 from public.crm_members where workspace_id=w and user_id::text=member and role in ('admin','editor')) then return member; end if;
  end if;
 else
  select value into col from jsonb_array_elements(cols) where value->>'id'=k;
  if col is not null then return coalesce(col->>'assigneeId',''); end if;
 end if;
 raise exception 'Colonne inconnue' using errcode='22023';
end;$$;
revoke all on function public.crm_task_column_account(uuid,integer,text) from public,anon,authenticated;

create or replace function public.crm_guard_backlog()
returns trigger language plpgsql security definer set search_path='' as $$
declare admin boolean; oldp jsonb; nextp jsonb; target text; column_owner text; claiming boolean; actor text; operation text;
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
   if not exists(select 1 from auth.users where id::text=nextp->>'completedBy' and email=nextp->>'completedByLabel') then raise exception 'Libellé de réalisation invalide'; end if;
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
