-- Après 011_edition_branding.sql. Liens publics liés au millésime.
begin;
create function public.crm_public_survey_info(p_code text,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; wid uuid; selected_year integer; logo text;
begin
 select workspace_id into wid from public.crm_survey_sites where code=p_code;
 if p_year is not null then
  select year into selected_year from public.crm_editions where workspace_id=wid and year=p_year;
 else
  select year into selected_year from public.crm_editions
  where workspace_id=wid and year=extract(year from current_date)::integer;
  if selected_year is null then
   select max(year) into selected_year from public.crm_editions where workspace_id=wid;
  end if;
 end if;
 if selected_year is null then raise exception 'Formulaire indisponible pour cette édition' using errcode='22023'; end if;
 select payload->>'logoPath' into logo from public.crm_settings
 where workspace_id=wid and edition_year=selected_year and id='main';
 select jsonb_build_object(
  'year',selected_year,
  'logo',case when logo like wid::text||'/'||selected_year::text||'/%' then logo else null end,
  'forms',coalesce(jsonb_object_agg(type,jsonb_build_object('version',version,'questions',questions)),'{}'::jsonb)
 ) into result
 from public.crm_survey_forms where workspace_id=wid and edition_year=selected_year;
 return result;
end;$$;
revoke all on function public.crm_public_survey_info(text,integer) from public;
grant execute on function public.crm_public_survey_info(text,integer) to anon,authenticated;

-- Préserve la validation des réponses et les snapshots des questions ; autorise chaque édition existante.
create or replace function public.crm_submit_survey(p_code text,p_year integer,p_type text,p_answers jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare wid uuid; new_id uuid; allowed text[]; required text[]; k text; v text;
 definitions jsonb; q jsonb; active boolean; val jsonb; valid_keys text[]:='{}';
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
    or q->>'kind'='number' and jsonb_typeof(val)<>'number'
    or q->>'kind'='date' and (jsonb_typeof(val)<>'string' or val#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    or q->>'kind' in ('text','short') and (jsonb_typeof(val)<>'string' or pg_catalog.length(val#>>'{}')>1200)
    or q->>'kind' in ('choice','dropdown') and (jsonb_typeof(val)<>'string' or not q->'options' ? (val#>>'{}'))
    or q->>'kind'='checkbox' and (jsonb_typeof(val)<>'array' or jsonb_array_length(val)>25 or exists(select 1 from jsonb_array_elements(val) opt where not q->'options' ? (opt.value#>>'{}')))
   then raise exception 'Réponse invalide : %',k using errcode='22023'; end if;
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
