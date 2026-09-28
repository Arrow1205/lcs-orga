-- Exécuter une fois dans le SQL Editor du projet Supabase connecté à Vercel.
-- Les paramètres du salon sont déjà conservés dans crm_settings.payload (JSONB) par année.
begin;

create or replace function public.crm_list_members(p_workspace uuid)
returns table(member_id uuid, email text, member_role text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès refusé' using errcode='42501';
 end if;
 return query
 select m.user_id,u.email::text,m.role
 from public.crm_members m join auth.users u on u.id=m.user_id
 where m.workspace_id=p_workspace order by lower(u.email);
end;
$$;
revoke all on function public.crm_list_members(uuid) from public,anon;
grant execute on function public.crm_list_members(uuid) to authenticated;

create or replace function public.crm_set_member(p_workspace uuid,p_email text,p_role text,p_remove boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare member_uuid uuid;
begin
 if not public.crm_has_role(p_workspace::text,array['admin']) then
  raise exception 'Action réservée aux administrateurs' using errcode='42501';
 end if;
 if p_email is null or length(trim(p_email))=0 then
  raise exception 'Email requis' using errcode='22023';
 end if;
 if p_role is null or p_role not in ('admin','editor','viewer') then
  raise exception 'Rôle invalide' using errcode='22023';
 end if;
 select u.id into member_uuid from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
 if member_uuid is null then
  raise exception 'Compte absent : créer d’abord cet utilisateur dans Supabase Authentication' using errcode='22023';
 end if;
 if p_remove then
  if member_uuid=(select auth.uid()) then
   raise exception 'Impossible de retirer ton propre accès' using errcode='22023';
  end if;
  delete from public.crm_members where workspace_id=p_workspace and user_id=member_uuid;
 else
  if member_uuid=(select auth.uid()) and p_role<>'admin' then
   raise exception 'Impossible de retirer ton propre rôle administrateur' using errcode='22023';
  end if;
  insert into public.crm_members(workspace_id,user_id,role)
   values(p_workspace,member_uuid,p_role)
   on conflict(workspace_id,user_id) do update set role=excluded.role;
 end if;
end;
$$;
revoke all on function public.crm_set_member(uuid,text,text,boolean) from public,anon;
grant execute on function public.crm_set_member(uuid,text,text,boolean) to authenticated;
commit;
