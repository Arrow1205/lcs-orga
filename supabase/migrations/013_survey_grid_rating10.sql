-- Après 012_survey_year_links.sql. Grille à choix multiple et note 0–10.
begin;
create or replace function public.crm_survey_save_form(p_workspace uuid,p_year integer,p_type text,p_version integer,p_questions jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare q jsonb; item jsonb; keys text[]:='{}'; count_options integer; next_version integer;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then
  raise exception 'Édition refusée' using errcode='42501'; end if;
 if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then
  raise exception 'Édition clôturée' using errcode='42501'; end if;
 if p_type not in ('visiteur','vip','exposant') or p_questions is null or jsonb_typeof(p_questions)<>'array'
  or jsonb_array_length(p_questions)<1 or jsonb_array_length(p_questions)>40
  or pg_catalog.octet_length(p_questions::text)>30000 then
  raise exception 'Formulaire invalide' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if jsonb_typeof(q)<>'object' or coalesce(q->>'key','') !~ '^[A-Za-z][A-Za-z0-9_]{0,70}$'
   or q->>'key'=any(keys) or pg_catalog.length(coalesce(q->>'label','')) not between 1 and 200
   or pg_catalog.length(coalesce(q->>'hint',''))>300
   or q->>'kind' not in ('rating','rating10','grid','choice','dropdown','checkbox','text','short','number','date')
   or coalesce(jsonb_typeof(q->'required'),'boolean')<>'boolean'
  then raise exception 'Question invalide ou doublon' using errcode='22023'; end if;
  if q ? 'showIf' and not q->'showIf'->>'key'=any(keys) then
   raise exception 'Place la question conditionnelle après la question qui la déclenche' using errcode='22023'; end if;
  keys:=array_append(keys,q->>'key');
  if q->>'kind' in ('choice','dropdown','checkbox') then
   if jsonb_typeof(q->'options')<>'array' or jsonb_array_length(q->'options') not between 1 and 25
    or exists(select 1 from jsonb_array_elements(q->'options') item where jsonb_typeof(item.value)<>'string' or pg_catalog.length(item.value#>>'{}') not between 1 and 120)
   then raise exception 'Options invalides' using errcode='22023'; end if;
  end if;
  if q->>'kind'='grid' then
   if jsonb_typeof(q->'rows')<>'array' or jsonb_array_length(q->'rows') not between 1 and 12
    or jsonb_typeof(q->'columns')<>'array' or jsonb_array_length(q->'columns') not between 2 and 8
    or exists(select 1 from jsonb_array_elements(q->'rows') item where jsonb_typeof(item.value)<>'string' or pg_catalog.length(item.value#>>'{}') not between 1 and 120)
    or exists(select 1 from jsonb_array_elements(q->'columns') item where jsonb_typeof(item.value)<>'string' or pg_catalog.length(item.value#>>'{}') not between 1 and 120)
    or (select count(distinct value) from jsonb_array_elements_text(q->'rows'))<>jsonb_array_length(q->'rows')
    or (select count(distinct value) from jsonb_array_elements_text(q->'columns'))<>jsonb_array_length(q->'columns')
   then raise exception 'Lignes ou colonnes de grille invalides' using errcode='22023'; end if;
  end if;
  if q ? 'showIf' and (jsonb_typeof(q->'showIf')<>'object' or coalesce(q->'showIf'->>'key','')='' or coalesce(q->'showIf'->>'equals','')='')
  then raise exception 'Condition invalide' using errcode='22023'; end if;
 end loop;
 -- Verrouillage et version attendue : deux membres ne s'écrasent pas mutuellement.
 perform 1 from public.crm_editions where workspace_id=p_workspace and year=p_year for update;
 if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then
  raise exception 'Édition clôturée' using errcode='42501'; end if;
 select version into next_version from public.crm_survey_forms where workspace_id=p_workspace and edition_year=p_year and type=p_type for update;
 if coalesce(next_version,0) is distinct from p_version then raise exception 'Le formulaire a été modifié par un autre membre' using errcode='40001'; end if;
 next_version:=coalesce(next_version,0)+1;
 insert into public.crm_survey_forms(workspace_id,edition_year,type,version,questions)
 values(p_workspace,p_year,p_type,next_version,p_questions)
 on conflict(workspace_id,edition_year,type) do update set version=excluded.version,questions=excluded.questions,updated_at=now();
 return next_version;
end;$$;
revoke all on function public.crm_survey_save_form(uuid,integer,text,integer,jsonb) from public,anon;
grant execute on function public.crm_survey_save_form(uuid,integer,text,integer,jsonb) to authenticated;

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
   k:=q->>'key'; active:=not(q ? 'showIf') or p_answers->>(q->'showIf'->>'key')=q->'showIf'->>'equals';
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
commit;
