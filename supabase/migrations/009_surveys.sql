-- Après 008_close_editions.sql. Exécuter une seule fois dans le SQL Editor Supabase.
begin;
create table public.crm_survey_sites (
 code text primary key check(code ~ '^[a-z0-9-]{2,40}$'),
 workspace_id uuid not null unique references public.crm_workspaces(id) on delete cascade
);
-- Ce projet dispose d'un seul espace. Pour plusieurs espaces, créer un code par espace.
insert into public.crm_survey_sites(code,workspace_id)
select 'lcs',id from public.crm_workspaces order by created_at limit 1;
create table public.crm_survey_responses (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 edition_year integer not null,
 type text not null check(type in ('visiteur','vip','exposant')),
 answers jsonb not null check(jsonb_typeof(answers)='object'),
 created_at timestamptz not null default now(),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year) on delete cascade
);
create index crm_survey_responses_year on public.crm_survey_responses(workspace_id,edition_year,type,created_at desc);
alter table public.crm_survey_sites enable row level security;
alter table public.crm_survey_responses enable row level security;
revoke all on public.crm_survey_sites,public.crm_survey_responses from public,anon,authenticated;
-- Aucun accès direct aux réponses : seules les fonctions ci-dessous les exposent.
create function public.crm_public_survey_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('year',max(e.year)) into result
 from public.crm_survey_sites s join public.crm_editions e on e.workspace_id=s.workspace_id
 where s.code=p_code;
 if result->>'year' is null then raise exception 'Formulaire indisponible' using errcode='22023'; end if;
 return result;
end;$$;
revoke all on function public.crm_public_survey_info(text) from public;
grant execute on function public.crm_public_survey_info(text) to anon,authenticated;

create function public.crm_submit_survey(p_code text,p_year integer,p_type text,p_answers jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare wid uuid; new_id uuid; allowed text[]; required text[]; k text; v text;
begin
 select workspace_id into wid from public.crm_survey_sites where code=p_code;
 if wid is null or p_year is distinct from (select max(year) from public.crm_editions where workspace_id=wid)
 then raise exception 'Formulaire indisponible pour cette édition' using errcode='22023'; end if;
 if p_type not in ('visiteur','vip','exposant') or p_answers is null or jsonb_typeof(p_answers)<>'object'
    or pg_catalog.octet_length(p_answers::text)>12000
 then raise exception 'Réponses non valides' using errcode='22023'; end if;
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
  if not k=any(allowed) or pg_catalog.length(v)>1200 then
   raise exception 'Champ de réponse invalide' using errcode='22023'; end if;
  if k=any(array['satisfaction','premiumEntry','setup','attendance','value','roi'])
   and v not in ('0','1','2','3','4','5') then
    raise exception 'Note invalide' using errcode='22023'; end if;
 end loop;
 if p_type='vip' and p_answers->>'premiumType' not in ('VIP','Early Access')
 or p_type='exposant' and (p_answers->>'participation' not in ('Exposant','Partenaire')
 or p_answers ? 'vendorType' and p_answers->>'vendorType' not in ('Professionnel','Particulier','Artiste'))
 or p_answers->>'returnIntent' not in ('Oui','Peut-être','Non')
 then raise exception 'Choix invalide' using errcode='22023'; end if;
 -- Protection de base contre une rafale anonyme, sans conserver d'adresse IP.
 if (select count(*) from public.crm_survey_responses where workspace_id=wid and created_at>now()-interval '1 minute')>=60
 then raise exception 'Trop de réponses, réessayer dans une minute' using errcode='22023'; end if;
 insert into public.crm_survey_responses(workspace_id,edition_year,type,answers)
 values(wid,p_year,p_type,p_answers) returning id into new_id;
 return new_id;
end;$$;
revoke all on function public.crm_submit_survey(text,integer,text,jsonb) from public;
grant execute on function public.crm_submit_survey(text,integer,text,jsonb) to anon,authenticated;

create function public.crm_survey_results(p_workspace uuid,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès refusé' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',type,'answers',answers,'created_at',created_at) order by created_at desc),'[]'::jsonb)
 into result from public.crm_survey_responses where workspace_id=p_workspace and edition_year=p_year;
 return result;
end;$$;
revoke all on function public.crm_survey_results(uuid,integer) from public,anon;
grant execute on function public.crm_survey_results(uuid,integer) to authenticated;
commit;
