-- Après avoir créé TON compte dans Supabase Authentication > Users > Add user.
-- Remplacer seulement l'adresse ci-dessous, exécuter une seule fois.
do $$
declare owner_id uuid; new_workspace uuid;
begin
 select id into owner_id from auth.users where lower(email)=lower('TON_EMAIL_ICI');
 if owner_id is null then raise exception 'Créer le compte Auth avec cette adresse avant de continuer'; end if;
 if exists(select 1 from public.crm_members where user_id=owner_id) then
  raise exception 'Ce compte a déjà un espace. Ne pas recréer.';
 end if;
 insert into public.crm_workspaces(name) values ('Lille Card Show') returning id into new_workspace;
 insert into public.crm_members values(new_workspace,owner_id,'admin');
 insert into public.crm_state(workspace_id) values(new_workspace);
 raise notice 'Espace créé : %',new_workspace;
end $$;
select * from public.crm_workspaces;
