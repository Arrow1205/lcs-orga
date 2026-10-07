-- Copie le questionnaire visiteur 2026 actuellement enregistré, sans copier les réponses.
begin;
do $migration$
declare
 wid uuid;
 source_questions jsonb;
 premium_questions jsonb := $questions$[
  {"key":"vip_ticket","label":"Quel billet avais-tu ?","kind":"choice","options":["VIP","Early Access"],"required":true},
  {"key":"vip_bag","label":"Quelle note donnerais-tu à la qualité du sac VIP ?","kind":"rating10","hint":"Note de 0 à 10.","required":true,"showIf":{"key":"vip_ticket","equals":"VIP"}},
  {"key":"vip_price","label":"Comment évalues-tu le prix payé pour l’accès anticipé ?","kind":"choice","options":["Bon rapport qualité/prix","Trop cher"],"required":true},
  {"key":"vip_duration","label":"Comment évalues-tu la durée de l’accès anticipé ?","kind":"choice","options":["Beaucoup trop courte","Un peu trop courte","Adaptée","Un peu trop longue","Beaucoup trop longue"],"required":true},
  {"key":"vip_community_pack","label":"Serais-tu intéressé·e par un pack VIP dédié à ta communauté ?","kind":"choice","options":["Oui","Non"],"required":true}
 ]$questions$::jsonb;
begin
 select workspace_id into wid from public.crm_survey_sites where code='lcs';
 if wid is null then raise exception 'Espace LCS introuvable'; end if;
 perform 1 from public.crm_editions where workspace_id=wid and year=2026 for update;
 if not found then raise exception 'Édition 2026 introuvable'; end if;
 if exists(select 1 from public.crm_editions where workspace_id=wid and year=2026 and closed_at is not null)
 then raise exception 'Édition 2026 clôturée'; end if;
 select questions into source_questions from public.crm_survey_forms
 where workspace_id=wid and edition_year=2026 and type='visiteur' for update;
 if source_questions is null or jsonb_typeof(source_questions)<>'array' or jsonb_array_length(source_questions)=0
 then raise exception 'Questionnaire visiteur 2026 introuvable'; end if;
 if exists(select 1 from jsonb_array_elements(source_questions) q
   where q->>'key' in ('vip_ticket','vip_bag','vip_price','vip_duration','vip_community_pack'))
 then raise exception 'Une clé VIP existe déjà dans le formulaire visiteur'; end if;
 if jsonb_array_length(source_questions)+5>40 or octet_length((premium_questions||source_questions)::text)>30000
 then raise exception 'Le questionnaire VIP dépasse la taille autorisée'; end if;
 insert into public.crm_survey_forms(workspace_id,edition_year,type,version,questions)
 values(wid,2026,'vip',1,premium_questions||source_questions)
 on conflict(workspace_id,edition_year,type) do update
 set version=public.crm_survey_forms.version+1,
     questions=excluded.questions,updated_at=now();
end;
$migration$;
commit;
