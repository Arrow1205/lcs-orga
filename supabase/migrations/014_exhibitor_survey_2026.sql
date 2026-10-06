-- Après 013_survey_grid_rating10.sql.
-- Ajoute les conditions multi-réponses (showIf.anyOf) et remplace le formulaire Exposant / partenaire 2026.
begin;

create or replace function public.crm_submit_survey(p_code text,p_year integer,p_type text,p_answers jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare wid uuid; new_id uuid; allowed text[]; required text[]; k text; v text;
 definitions jsonb; q jsonb; active boolean; val jsonb; row_name text; choice_value text; valid_keys text[]:='{}';
begin
 select workspace_id into wid from public.crm_survey_sites where code=p_code;
 if wid is null or not exists(select 1 from public.crm_editions where workspace_id=wid and year=p_year)
 then raise exception 'Formulaire indisponible pour cette édition' using errcode='22023'; end if;
 if p_type is null or p_type not in ('visiteur','vip','exposant') or p_answers is null or jsonb_typeof(p_answers)<>'object'
    or pg_catalog.octet_length(p_answers::text)>12000
 then raise exception 'Réponses non valides' using errcode='22023'; end if;
 select questions into definitions from public.crm_survey_forms where workspace_id=wid and edition_year=p_year and type=p_type;
 if definitions is not null then
  for q in select value from jsonb_array_elements(definitions) loop
   k:=q->>'key';
   active:=not(q ? 'showIf')
    or (q->'showIf' ? 'equals' and p_answers->>(q->'showIf'->>'key')=q->'showIf'->>'equals')
    or (q->'showIf' ? 'anyOf' and exists(select 1 from jsonb_array_elements_text(q->'showIf'->'anyOf') opt where opt.value=p_answers->>(q->'showIf'->>'key')));
   if not active then continue; end if;
   valid_keys:=array_append(valid_keys,k);val:=p_answers->k;
   if val is null or val='null'::jsonb or val='""'::jsonb or val='[]'::jsonb then
    if coalesce((q->>'required')::boolean,false) then raise exception 'Réponse obligatoire manquante : %',k using errcode='22023'; end if;
    continue;
   end if;
   if q->>'kind'='rating' and (jsonb_typeof(val)<>'number' or val::text not in ('0','1','2','3','4','5'))
    or q->>'kind'='rating10' and (jsonb_typeof(val)<>'number' or val::text not in ('0','1','2','3','4','5','6','7','8','9','10'))
    or q->>'kind'='number' and jsonb_typeof(val)<>'number'
    or q->>'kind'='date' and (jsonb_typeof(val)<>'string' or val#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or q->>'kind' in ('text','short') and (jsonb_typeof(val)<>'string' or pg_catalog.length(val#>>'{}')>1200)
    or q->>'kind' in ('choice','dropdown') and (jsonb_typeof(val)<>'string' or not q->'options' ? (val#>>'{}'))
    or q->>'kind'='checkbox' and (jsonb_typeof(val)<>'array' or jsonb_array_length(val)>25 or exists(select 1 from jsonb_array_elements(val) opt where not q->'options' ? (opt.value#>>'{}')))
   then raise exception 'Réponse invalide : %',k using errcode='22023'; end if;
   if q->>'kind'='grid' then
    if jsonb_typeof(val)<>'object' or (coalesce((q->>'required')::boolean,false)
      and exists(select 1 from jsonb_array_elements_text(q->'rows') row_item where not val ? row_item.value))
    then raise exception 'Grille incomplète : %',k using errcode='22023'; end if;
    for row_name,choice_value in select key,value from jsonb_each_text(val) loop
     if not q->'rows' ? row_name or jsonb_typeof(val->row_name)<>'string' or not q->'columns' ? choice_value
     then raise exception 'Choix invalide dans la grille : %',k using errcode='22023'; end if;
    end loop;
   end if;
  end loop;
  for k in select jsonb_object_keys(p_answers) loop
   if not k=any(valid_keys) then raise exception 'Champ de réponse inconnu : %',k using errcode='22023'; end if;
  end loop;
 else
  allowed:=array['satisfaction','highlights','improvements','returnIntent','community','duration','purchase','zones','discovery'];
  required:=array['satisfaction','returnIntent','community','duration','purchase'];
  if p_type='vip' then
   allowed:=allowed||array['premiumType','premiumEntry','premiumValue'];
   required:=required||array['premiumType','premiumEntry','premiumValue'];
  elsif p_type='exposant' then
   allowed:=array['participation','vendorType','community','zone','setup','attendance','value','roi','satisfaction','highlights','improvements','returnIntent','identity'];
   required:=array['participation','setup','attendance','value','roi','satisfaction','returnIntent'];
   if p_answers->>'participation'='Exposant' then required:=array_append(required,'vendorType'); end if;
  end if;
  foreach k in array required loop
   if coalesce(p_answers->>k,'')='' then raise exception 'Réponse obligatoire manquante : %',k using errcode='22023'; end if;
  end loop;
  for k,v in select key,value from jsonb_each_text(p_answers) loop
   if not k=any(allowed) or pg_catalog.length(v)>1200 then raise exception 'Champ de réponse invalide' using errcode='22023'; end if;
   if k=any(array['satisfaction','premiumEntry','setup','attendance','value','roi']) and v not in ('0','1','2','3','4','5') then
    raise exception 'Note invalide' using errcode='22023'; end if;
  end loop;
  if p_type='vip' and p_answers->>'premiumType' not in ('VIP','Early Access')
   or p_type='exposant' and (p_answers->>'participation' not in ('Exposant','Partenaire')
   or p_answers ? 'vendorType' and p_answers->>'vendorType' not in ('Professionnel','Particulier','Artiste'))
   or p_answers->>'returnIntent' not in ('Oui','Peut-être','Non')
  then raise exception 'Choix invalide' using errcode='22023'; end if;
 end if;
 if (select count(*) from public.crm_survey_responses where workspace_id=wid and created_at>now()-interval '1 minute')>=60
 then raise exception 'Trop de réponses, réessayer dans une minute' using errcode='22023'; end if;
 insert into public.crm_survey_responses(workspace_id,edition_year,type,answers,question_snapshot)
 values(wid,p_year,p_type,p_answers,definitions) returning id into new_id;
 return new_id;
end;$$;
revoke all on function public.crm_submit_survey(text,integer,text,jsonb) from public;
grant execute on function public.crm_submit_survey(text,integer,text,jsonb) to anon,authenticated;

with target as (
 select workspace_id from public.crm_survey_sites where code='lcs'
),
payload as (
 select '[
{"key":"q1_status","label":"Quel était votre statut sur le salon ?","kind":"choice","options":["Particulier","Professionnel","Partenaire"],"required":true},
{"key":"q2_zone","label":"Dans quelle zone étiez-vous ?","kind":"choice","options":["Football","Basketball","Sports US","TCG / Pokémon"],"required":true},
{"key":"q3_experience","label":"Globalement, quelle note donneriez-vous à votre expérience au Lille Card Show ?","kind":"rating10","hint":"Note de 1 à 10","required":true},
{"key":"q4_location","label":"Quelle note donneriez-vous à votre emplacement sur le salon ?","kind":"rating10","hint":"Note de 1 à 10","required":true},
{"key":"q5_space_fit","label":"L’espace que vous aviez sélectionné à l’inscription était-il adapté à votre activité ?","kind":"choice","options":["Beaucoup trop petit","Un peu trop petit","Adapté","Plus grand que nécessaire"],"required":true},
{"key":"q6_space_limit","label":"Avez-vous renoncé à exposer une partie de vos produits par manque de place ?","kind":"choice","options":["Oui, beaucoup","Oui, un peu","Non"],"required":true},
{"key":"q7_logistics","label":"Sur la logistique pure, comment évalueriez-vous les éléments suivants ?","kind":"grid","rows":["Installation / déchargement","Accès au stand","Espace derrière les tables","Largeur de votre espace","Circulation autour de votre stand","Espace de rangement / stockage","Mobilier mis à disposition"],"columns":["1","2","3","4","5"],"hint":"Note de 1 à 5 pour chaque élément.","required":true},
{"key":"q8_flow","label":"Comment évaluez-vous le flux de visiteurs devant votre stand ?","kind":"choice","options":["Très faible","Faible","Correct","Bon","Excellent"],"required":true},
{"key":"q9_crowding","label":"Avez-vous connu des périodes où l’affluence était trop importante pour travailler correctement ou accueillir les visiteurs ?","kind":"choice","options":["Oui, régulièrement","Oui, ponctuellement","Non","Je ne sais pas"],"required":true},
{"key":"q10_buying_type","label":"Selon vous, quel type d’achat les visiteurs recherchaient-ils principalement ?","kind":"choice","options":["Petites cartes / cartes à l’unité pour compléter des sets","Cartes milieu de gamme","Grosses pièces / High-End","Un mélange assez équilibré","Difficile à évaluer"],"required":true},
{"key":"q11_card_budget","label":"Quel budget les visiteurs semblaient-ils généralement prêts à mettre sur une carte ?","kind":"choice","options":["Moins de 20 €","20 à 50 €","50 à 100 €","100 à 250 €","250 à 500 €","500 € et +","Difficile à estimer"],"required":true},
{"key":"q12_best_sellers","label":"Quels produits se sont le mieux vendus sur votre stand ?","kind":"checkbox","options":["Singles petit budget","Singles milieu de gamme","Singles premium / High-End","Cartes gradées","Boxes / Displays","Boosters / Packs","Sets / Lots","Produits dérivés / accessoires","Autre"],"required":true},
{"key":"q13_revenue","label":"Quel chiffre d’affaires approximatif avez-vous réalisé pendant le salon ?","kind":"choice","options":["Moins de 250 €","250 à 500 €","500 à 1 000 €","1 000 à 2 000 €","2 000 à 5 000 €","5 000 à 10 000 €","Plus de 10 000 €","Je préfère ne pas répondre"],"required":true},
{"key":"q14_sales_expectations","label":"Par rapport à vos attentes avant le salon, vos ventes ont été :","kind":"choice","options":["Très inférieures à mes attentes","Inférieures à mes attentes","Conformes à mes attentes","Supérieures à mes attentes","Très supérieures à mes attentes"],"required":true},
{"key":"q15_value","label":"Comment évaluez-vous le rapport qualité/prix de votre participation ?","kind":"rating10","hint":"Note de 1 à 10","required":true},
{"key":"q16_organization","label":"Comment évaluez-vous l’organisation exposant sur les éléments suivants ?","kind":"grid","rows":["Communication avant l’événement","Informations pratiques reçues","Accueil exposant","Installation","Signalétique","Circulation","Parking / chargement-déchargement","Accompagnement de l’organisation"],"columns":["1","2","3","4","5"],"hint":"Note de 1 à 5 pour chaque élément.","required":true},
{"key":"q17_return","label":"Envisagez-vous de revenir exposer au Lille Card Show lors de la prochaine édition ?","kind":"choice","options":["Oui, certainement","Oui, probablement","Je ne sais pas encore","Probablement pas","Non"],"required":true},
{"key":"q18_no_return_reason","label":"Quelle est la principale raison qui pourrait vous empêcher de revenir ?","kind":"checkbox","options":["Tarif","Chiffre d’affaires insuffisant","Emplacement","Manque de visiteurs qualifiés","Manque d’espace","Logistique","Distance / déplacement","Date de l’événement","Format du salon","Autre"],"required":true,"showIf":{"key":"q17_return","anyOf":["Probablement pas","Non"]}},
{"key":"q19_next_config","label":"Si vous revenez, quelle configuration souhaiteriez-vous par rapport à cette année ?","kind":"checkbox","options":["Exactement la même","Plus de tables","Davantage d’espace autour de mes tables","Un véritable stand / espace en m²","Moins d’espace","Je ne sais pas encore"],"required":true},
{"key":"q20_booking_choice","label":"Pour une prochaine édition, souhaiteriez-vous pouvoir choisir entre une réservation à la table et une réservation au m² ?","kind":"choice","options":["Oui","Non","Sans préférence"],"required":true},
{"key":"q21_booking_type","label":"Quel type de réservation vous intéresserait principalement ?","kind":"choice","options":["Réservation à la table","Réservation au m²"],"required":true,"showIf":{"key":"q20_booking_choice","equals":"Oui"}},
{"key":"q22_tables","label":"Combien de tables souhaiteriez-vous idéalement réserver ?","kind":"choice","options":["1 table","2 tables","3 tables","4 tables","5 tables","6 tables ou plus"],"required":true,"showIf":{"key":"q21_booking_type","equals":"Réservation à la table"}},
{"key":"q23_surface","label":"Quelle surface souhaiteriez-vous idéalement réserver ?","kind":"choice","options":["4 à 6 m²","7 à 9 m²","10 à 12 m²","13 à 18 m²","19 à 25 m²","Plus de 25 m²"],"required":true,"showIf":{"key":"q21_booking_type","equals":"Réservation au m²"}},
{"key":"q24_budget_increase","label":"Si un espace plus grand vous était proposé, seriez-vous prêt à augmenter votre budget exposant ?","kind":"choice","options":["Oui, clairement","Oui, légèrement","Peut-être, selon le tarif","Non"],"required":true},
{"key":"q25_improvement","label":"Quelle est la principale chose que nous devrions améliorer pour la prochaine édition ?","kind":"text"},
{"key":"q26_keep","label":"Y a-t-il au contraire quelque chose que vous souhaitez absolument que nous conservions tel quel ?","kind":"text"},
{"key":"q27_suggestion","label":"Avez-vous une remarque, une idée ou une suggestion complémentaire ?","kind":"text"}
]'::jsonb as questions
)
insert into public.crm_survey_forms(workspace_id,edition_year,type,version,questions)
select target.workspace_id,2026,'exposant',coalesce(existing.version,0)+1,payload.questions
from target cross join payload
left join public.crm_survey_forms existing on existing.workspace_id=target.workspace_id and existing.edition_year=2026 and existing.type='exposant'
on conflict(workspace_id,edition_year,type) do update
set version=excluded.version,questions=excluded.questions,updated_at=now();

commit;
