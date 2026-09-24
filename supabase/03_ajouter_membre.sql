-- Créer le compte de la personne dans Authentication d'abord.
-- Remplacer EMAIL, UUID_ESPACE et role (admin, editor ou viewer).
-- Cette opération n'envoie aucun email.
insert into public.crm_members(workspace_id,user_id,role)
select 'UUID_ESPACE'::uuid,id,'editor' from auth.users where lower(email)=lower('EMAIL_MEMBRE')
on conflict(workspace_id,user_id) do update set role=excluded.role;
-- Vérifier qu'une ligne a bien été ajoutée :
select m.workspace_id,u.email,m.role from public.crm_members m join auth.users u on u.id=m.user_id;
