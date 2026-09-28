-- Après 007_global_owners.sql. Une seule fois dans le SQL Editor du bon projet.
-- Conserve toutes les fiches et bloque les écritures d'une édition clôturée.
begin;
alter table public.crm_editions add column closed_at timestamptz;
alter table public.crm_editions add column closed_by uuid references auth.users(id);

-- Conserver la version actuelle sous un nom inaccessible directement aux membres.
alter function public.crm_apply_changes(uuid,uuid,jsonb,integer) rename to crm_apply_changes_open;
revoke all on function public.crm_apply_changes_open(uuid,uuid,jsonb,integer) from public,anon,authenticated;

create function public.crm_apply_changes(p_workspace uuid,p_request uuid,p_changes jsonb,p_year integer)
returns bigint language plpgsql security definer set search_path='' as $$
declare prior_changes jsonb; prior_revision bigint;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Accès en écriture refusé' using errcode='42501';
 end if;
 -- Même verrou que l'ancienne fonction : clôture et sauvegarde sont sérialisées.
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 -- Une sauvegarde déjà confirmée reste rejouable si la clôture arrive juste après.
 select changes,revision into prior_changes,prior_revision from public.crm_requests
 where workspace_id=p_workspace and edition_year=p_year and request_id=p_request;
 if found then
  if prior_changes is distinct from p_changes then raise exception 'UUID de requête réutilisé' using errcode='22023'; end if;
  return prior_revision;
 end if;
 if exists(select 1 from public.crm_editions
           where workspace_id=p_workspace and year=p_year and closed_at is not null) then
  raise exception 'Cette édition est clôturée : lecture seule' using errcode='42501';
 end if;
 return public.crm_apply_changes_open(p_workspace,p_request,p_changes,p_year);
end;
$$;
revoke all on function public.crm_apply_changes(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.crm_apply_changes(uuid,uuid,jsonb,integer) to authenticated;

create function public.crm_set_edition_closed(p_workspace uuid,p_year integer,p_closed boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare current_closed boolean;
begin
 if not public.crm_has_role(p_workspace::text,array['admin']) then
  raise exception 'Seul un administrateur peut clôturer ou rouvrir une édition' using errcode='42501';
 end if;
 if p_closed is null then raise exception 'Statut de clôture invalide' using errcode='22023'; end if;
 perform 1 from public.crm_v2_status where workspace_id=p_workspace for update;
 select closed_at is not null into current_closed from public.crm_editions
 where workspace_id=p_workspace and year=p_year for update;
 if not found then raise exception 'Année inexistante' using errcode='22023'; end if;
 if current_closed is distinct from p_closed then
  update public.crm_editions set closed_at=case when p_closed then now() else null end,
    closed_by=case when p_closed then auth.uid() else null end
  where workspace_id=p_workspace and year=p_year;
  update public.crm_v2_status set revision=revision+1 where workspace_id=p_workspace;
 end if;
 return p_closed;
end;
$$;
revoke all on function public.crm_set_edition_closed(uuid,integer,boolean) from public,anon;
grant execute on function public.crm_set_edition_closed(uuid,integer,boolean) to authenticated;
commit;
