-- Facultatif : annuler UNE opération de l'historique, en administrateur.
-- Remplacer TON_EMAIL_ICI et 123 par l'email admin et l'id crm_history.
-- Refus si la fiche a changé depuis cette opération ; rien n'est écrasé.
begin;
select set_config('request.jwt.claim.sub',
 (select id::text from auth.users where lower(email)=lower('TON_EMAIL_ICI')),true);
select public.crm_restore_history(123,gen_random_uuid());
commit;
