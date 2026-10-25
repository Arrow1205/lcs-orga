-- Bureau interne : aucune réponse publique, aucun impact sur les questionnaires existants.
begin;
create table if not exists public.crm_bureau_forms (
 workspace_id uuid not null, edition_year integer not null,
 version integer not null default 1, questions jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,edition_year),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year) on delete cascade
);
create table if not exists public.crm_bureau_responses (
 workspace_id uuid not null, edition_year integer not null, participant_id uuid not null, owner_id uuid references auth.users(id), resume_token uuid, author_name text,
 version integer not null default 1, answers jsonb not null default '{}', questions jsonb not null,
 request_id uuid, last_patch jsonb, updated_at timestamptz not null default now(),
 primary key(workspace_id,edition_year,participant_id),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year) on delete cascade
);
create table if not exists public.crm_bureau_links (
 workspace_id uuid not null,edition_year integer not null,code uuid not null default gen_random_uuid() unique,
 primary key(workspace_id,edition_year),
 foreign key(workspace_id,edition_year) references public.crm_editions(workspace_id,year) on delete cascade
);
alter table public.crm_bureau_links enable row level security;
revoke all on public.crm_bureau_links from public,anon,authenticated;
alter table public.crm_bureau_forms enable row level security;
alter table public.crm_bureau_responses enable row level security;
revoke all on public.crm_bureau_forms,public.crm_bureau_responses from public,anon,authenticated;
-- Accès uniquement par RPC, contrôlé par rôle et espace. RLS active sans accès direct.
create or replace function public.crm_bureau_default_questions()
returns jsonb language sql immutable set search_path='' as $default$
 select $questions$[{"key":"bureau_q1","label":"Avons-nous suffisamment anticipé la préparation du salon (planning, délais, matériel, prestataires, imprévus) ?","kind":"rating","category":"Organisation & préparation","required":true},{"key":"bureau_q2","label":"La répartition des rôles et des responsabilités au sein de l’organisation était-elle claire et efficace ?","kind":"rating","category":"Organisation & préparation","required":true},{"key":"bureau_q3","label":"Quels ont été les principaux problèmes organisationnels avant, pendant et après l’événement ?","kind":"text","category":"Organisation & préparation","required":true},{"key":"bureau_q4","label":"Avions-nous suffisamment de bénévoles, aux bons endroits et aux bons moments (installation, accueil, surveillance, démontage) ?","kind":"rating","category":"Équipe & bénévoles","required":true},{"key":"bureau_q5","label":"La charge de travail était-elle bien répartie ou certaines personnes ont-elles dû compenser les manques ?","kind":"rating","category":"Équipe & bénévoles","required":true},{"key":"bureau_q6","label":"Qu’aurions-nous pu mieux organiser pour faciliter le travail de l’équipe et réduire le stress ?","kind":"text","category":"Équipe & bénévoles","required":true},{"key":"bureau_q7","label":"La salle, sa superficie et son implantation étaient-elles adaptées au nombre de visiteurs et d’exposants ?","kind":"choice","category":"Salle & logistique","required":true,"options":["Oui","Non"]},{"key":"bureau_q8","label":"L’installation, la gestion du matériel, les livraisons et le démontage se sont-ils déroulés efficacement ?","kind":"rating","category":"Salle & logistique","required":true},{"key":"bureau_q9","label":"La circulation, la signalétique, les espaces de repos et les équipements étaient-ils satisfaisants ?","kind":"rating","category":"Salle & logistique","required":true},{"key":"bureau_q10","label":"L’affluence a-t-elle répondu à nos attentes, et comment s’est-elle répartie au fil de la journée et entre les communautés ?","kind":"rating","category":"Affluence & visiteurs","required":true},{"key":"bureau_q11","label":"L’accueil, les files d’attente, les accès VIP/Early Access et la gestion des flux étaient-ils efficaces ?","kind":"rating","category":"Affluence & visiteurs","required":true},{"key":"bureau_q12","label":"Quelle expérience avons-nous réellement offerte aux visiteurs (ambiance, animations, confort, restauration, satisfaction) ?","kind":"choice","category":"Affluence & visiteurs","required":true,"options":["Ambiance","Animations","Confort","Restauration","Satisfaction"]},{"key":"bureau_q13","label":"Les exposants étaient-ils satisfaits de leur emplacement, de l’organisation, de l’affluence et de leurs ventes ?","kind":"choice","category":"Exposants & partenaires","required":true,"options":["Oui","Non","En partie"]},{"key":"bureau_q14","label":"Avons-nous proposé une offre suffisamment attractive et équilibrée entre professionnels, particuliers et communautés ?","kind":"rating","category":"Exposants & partenaires","required":true},{"key":"bureau_q15","label":"Nos partenaires et sponsors ont-ils apporté une réelle valeur au salon, et avons-nous respecté nos engagements ?","kind":"choice","category":"Exposants & partenaires","required":true,"options":["Oui","Non","En partie"]},{"key":"bureau_q16","label":"Notre communication avant, pendant et après le salon a-t-elle été efficace pour attirer et informer les visiteurs ?","kind":"rating","category":"Communication & finances","required":true},{"key":"bureau_q17","label":"Le résultat financier est-il satisfaisant, et quelles dépenses ou recettes méritent d’être optimisées ?","kind":"choice","category":"Communication & finances","required":true,"options":["Oui","Non","En partie"]},{"key":"bureau_q18","label":"Quels sont les trois plus grands succès du salon que nous devons absolument conserver ?","kind":"text","category":"Bilan & perspectives 2027","required":true},{"key":"bureau_q19","label":"Quels sont les trois principaux échecs ou points faibles que nous devons impérativement corriger ?","kind":"text","category":"Bilan & perspectives 2027","required":true},{"key":"bureau_q20","label":"Sommes-nous prêts à organiser un salon plus grand en 2027, et quelles sont les conditions indispensables pour y parvenir ?","kind":"text","category":"Bilan & perspectives 2027","required":true}]$questions$::jsonb;
$default$;
revoke all on function public.crm_bureau_default_questions() from public,anon;
grant execute on function public.crm_bureau_default_questions() to authenticated;

create or replace function public.crm_bureau_write(p_workspace uuid,p_year integer,p_participant uuid,p_owner uuid,p_secret uuid,p_values jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare qs jsonb;fv integer;q jsonb;item jsonb;old public.crm_bureau_responses;k text;v jsonb;patch jsonb;rid uuid;comments text;
begin
 if p_participant is null or (p_owner is null and p_secret is null) then raise exception 'Identifiant de reprise manquant' using errcode='22023'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>60000 then raise exception 'Données invalides' using errcode='22023'; end if;
 perform 1 from public.crm_editions where workspace_id=p_workspace and year=p_year for update;
 if not found then raise exception 'Édition introuvable' using errcode='22023'; end if;
 if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then raise exception 'Édition clôturée' using errcode='42501'; end if;
 select questions,version into qs,fv from public.crm_bureau_forms where workspace_id=p_workspace and edition_year=p_year;
 qs:=coalesce(qs,public.crm_bureau_default_questions());fv:=coalesce(fv,0);
  select * into old from public.crm_bureau_responses where workspace_id=p_workspace and edition_year=p_year and participant_id=p_participant for update;
  if old.participant_id is not null and (old.owner_id is distinct from p_owner or (p_owner is null and old.resume_token is distinct from p_secret)) then raise exception 'Accès refusé' using errcode='42501'; end if;
  rid:=(p_values->>'request_id')::uuid;k:=p_values->>'key';patch:=p_values->'answer';
  if rid is null or patch is null or jsonb_typeof(patch)<>'object' then raise exception 'Réponse invalide' using errcode='22023'; end if;
  if old.request_id=rid then
   if old.last_patch is distinct from p_values then raise exception 'Requête déjà utilisée' using errcode='22023'; end if;
   return jsonb_build_object('version',old.version);
  end if;
  if coalesce((p_values->>'version')::integer,-1)<>coalesce(old.version,0) or coalesce((p_values->>'form_version')::integer,-1)<>fv then
   raise exception 'Le bilan ou le formulaire a été modifié dans un autre onglet. Recharge avant de continuer.' using errcode='40001'; end if;
  if old.participant_id is null and (select count(*) from public.crm_bureau_responses where workspace_id=p_workspace and edition_year=p_year)>=6 then
   raise exception 'Le bureau est limité à six répondants par édition.' using errcode='22023'; end if;
  select x into q from jsonb_array_elements(qs) x where x->>'key'=k;
  if q is null then raise exception 'Question inconnue' using errcode='22023'; end if;
  v:=patch->'value';comments:=coalesce(patch->>'comment','');
  if length(comments)>5000 or jsonb_typeof(patch->'comment') not in ('string','null') then raise exception 'Commentaire invalide' using errcode='22023'; end if;
  if v is not null and v<>'null'::jsonb and v<>'""'::jsonb then
   if q->>'kind'='rating' and (jsonb_typeof(v)<>'number' or v::text not in ('1','2','3','4','5'))
    or q->>'kind' in ('choice','dropdown') and (jsonb_typeof(v)<>'string' or not q->'options' ? (v#>>'{}'))
    or q->>'kind' in ('text','short') and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>5000)
    or q->>'kind'='number' and jsonb_typeof(v)<>'number'
    or q->>'kind'='date' and (jsonb_typeof(v)<>'string' or v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$')
    or q->>'kind'='checkbox' and (jsonb_typeof(v)<>'array' or jsonb_array_length(v)>25 or exists(select 1 from jsonb_array_elements(v) o where not q->'options' ? (o#>>'{}')))
    then raise exception 'Valeur invalide pour cette question' using errcode='22023'; end if;
  end if;
  -- Un commentaire seul ne complète pas une question. Les brouillons incomplets restent autorisés.
  patch:=jsonb_build_object('value',coalesce(v,'null'::jsonb),'comment',comments);
  select coalesce(jsonb_agg(x),'[]'::jsonb) into item from jsonb_array_elements(coalesce(old.questions,'[]'::jsonb)) x where x->>'key'<>k;
  insert into public.crm_bureau_responses(workspace_id,edition_year,participant_id,owner_id,resume_token,author_name,version,answers,questions,request_id,last_patch)
   values(p_workspace,p_year,p_participant,p_owner,p_secret,nullif(left(trim(p_values->>'author_name'),100),''),coalesce(old.version,0)+1,coalesce(old.answers,'{}'::jsonb)||jsonb_build_object(k,patch),item||jsonb_build_array(q),rid,p_values)
   on conflict(workspace_id,edition_year,participant_id) do update set author_name=coalesce(excluded.author_name,crm_bureau_responses.author_name),version=excluded.version,answers=excluded.answers,questions=excluded.questions,request_id=excluded.request_id,last_patch=excluded.last_patch,updated_at=now();
  return jsonb_build_object('version',coalesce(old.version,0)+1);
end;$$;
revoke all on function public.crm_bureau_write(uuid,integer,uuid,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function public.crm_bureau(p_workspace uuid,p_year integer,p_action text,p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare qs jsonb; q jsonb; item jsonb; old public.crm_bureau_responses; expected integer;
 fv integer; next_version integer; target integer; keys text[]:='{}'; parent jsonb;
 k text; v jsonb; patch jsonb; rid uuid; result jsonb; comments text;
begin
 if auth.uid() is null or not public.crm_has_role(p_workspace::text,array['admin','editor','viewer']) then
  raise exception 'Accès refusé' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year) then
  raise exception 'Édition introuvable' using errcode='22023'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>60000 then
  raise exception 'Données invalides' using errcode='22023'; end if;
 select questions,version into qs,fv from public.crm_bureau_forms where workspace_id=p_workspace and edition_year=p_year;
 qs:=coalesce(qs,public.crm_bureau_default_questions());fv:=coalesce(fv,0);
 if p_action='read' then
  insert into public.crm_bureau_links(workspace_id,edition_year) values(p_workspace,p_year) on conflict do nothing;
  select coalesce(jsonb_agg(to_jsonb(r)-'request_id'-'last_patch'-'resume_token'||jsonb_build_object('author_name',coalesce(nullif(m.first_name,''),r.author_name,'Membre du bureau')) order by r.updated_at),'[]'::jsonb)
   into result from public.crm_bureau_responses r left join public.crm_members m on m.workspace_id=r.workspace_id and m.user_id=r.owner_id
   where r.workspace_id=p_workspace and r.edition_year=p_year;
  return jsonb_build_object('questions',qs,'version',fv,'responses',result,'share_code',(select code from public.crm_bureau_links where workspace_id=p_workspace and edition_year=p_year));
 end if;
 if not public.crm_has_role(p_workspace::text,array['admin','editor']) then raise exception 'Lecture seule' using errcode='42501'; end if;
 -- Sérialise les versions, le plafond de six répondants et la clôture de l’édition.
 perform 1 from public.crm_editions where workspace_id=p_workspace and year=p_year for update;
 if p_action<>'duplicate' and exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=p_year and closed_at is not null) then
  raise exception 'Édition clôturée' using errcode='42501'; end if;
 -- Relire la version du formulaire après acquisition du verrou.
 select questions,version into qs,fv from public.crm_bureau_forms where workspace_id=p_workspace and edition_year=p_year;
 qs:=coalesce(qs,public.crm_bureau_default_questions());fv:=coalesce(fv,0);
 if p_action in ('form_save','duplicate') then
  target:=case when p_action='duplicate' then (p_values->>'target_year')::integer else p_year end;
  if target is null or (p_action='duplicate' and target=p_year) then raise exception 'Choisis une autre année' using errcode='22023'; end if;
  perform 1 from public.crm_editions where workspace_id=p_workspace and year=target for update;
  if not found then raise exception 'Édition introuvable' using errcode='22023'; end if;
  if exists(select 1 from public.crm_editions where workspace_id=p_workspace and year=target and closed_at is not null) then raise exception 'Édition clôturée' using errcode='42501'; end if;
  select version into next_version from public.crm_bureau_forms where workspace_id=p_workspace and edition_year=target;
  next_version:=coalesce(next_version,0);
  if p_action='duplicate' and next_version>0 and coalesce(p_values->>'replace','false')<>'true' then return jsonb_build_object('exists',true); end if;
  if p_action='form_save' then
   if coalesce((p_values->>'version')::integer,-1)<>fv then raise exception 'Le formulaire a été modifié. Recharge la page.' using errcode='40001'; end if;
   qs:=p_values->'questions';
  end if;
  if qs is null or jsonb_typeof(qs)<>'array' or jsonb_array_length(qs) not between 1 and 40 or octet_length(qs::text)>40000 then
   raise exception 'Formulaire invalide' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(qs) loop
   k:=q->>'key';
   if jsonb_typeof(q)<>'object' or coalesce(k,'') !~ '^[A-Za-z][A-Za-z0-9_]{0,70}$' or k=any(keys)
    or length(coalesce(q->>'label','')) not between 1 and 200 or length(coalesce(q->>'category','Autre'))>120
    or q->>'kind' is null or q->>'kind' not in ('rating','choice','dropdown','checkbox','text','short','number','date')
    or coalesce(jsonb_typeof(q->'required'),'boolean')<>'boolean' then raise exception 'Question invalide' using errcode='22023'; end if;
   if q->>'kind' in ('choice','dropdown','checkbox') and (jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 1 and 25
     or exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or length(o#>>'{}') not between 1 and 120)
     or (select count(distinct o) from jsonb_array_elements(q->'options') o)<>jsonb_array_length(q->'options')) then raise exception 'Choix invalides' using errcode='22023'; end if;
   if q ? 'showIf' then
    select x into parent from jsonb_array_elements(qs) x where x->>'key'=q->'showIf'->>'key';
    if not coalesce(q->'showIf'->>'key'=any(keys),false) or parent->>'kind' not in ('choice','dropdown') or not coalesce(parent->'options' ? (q->'showIf'->>'equals'),false) then raise exception 'Condition invalide' using errcode='22023'; end if;
   end if;
   keys:=array_append(keys,k);
  end loop;
  next_version:=next_version+1;
  insert into public.crm_bureau_forms(workspace_id,edition_year,version,questions) values(p_workspace,target,next_version,qs)
   on conflict(workspace_id,edition_year) do update set version=excluded.version,questions=excluded.questions,updated_at=now();
  return jsonb_build_object('exists',false,'version',next_version);
 elsif p_action='save' then
  return public.crm_bureau_write(p_workspace,p_year,auth.uid(),auth.uid(),null,p_values);
 end if;
 raise exception 'Action inconnue' using errcode='22023';
end;$$;
revoke all on function public.crm_bureau(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.crm_bureau(uuid,integer,text,jsonb) to authenticated;
create or replace function public.crm_bureau_public(p_code uuid,p_action text,p_values jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare link public.crm_bureau_links;qs jsonb;fv integer;pid uuid;secret uuid;mine jsonb;
begin
 select * into link from public.crm_bureau_links where code=p_code;
 if not found then raise exception 'Lien indisponible' using errcode='22023'; end if;
 if p_values is null or jsonb_typeof(p_values)<>'object' or octet_length(p_values::text)>60000 then raise exception 'Données invalides' using errcode='22023'; end if;
 pid:=(p_values->>'participant_id')::uuid;secret:=(p_values->>'resume_token')::uuid;
 if pid is null or secret is null then raise exception 'Identifiant de reprise manquant' using errcode='22023'; end if;
 if p_action='read' then
  select questions,version into qs,fv from public.crm_bureau_forms where workspace_id=link.workspace_id and edition_year=link.edition_year;
  select jsonb_build_object('participant_id',r.participant_id,'author_name',coalesce(r.author_name,'Mon bilan'),'answers',r.answers,'questions',r.questions,'version',r.version) into mine
   from public.crm_bureau_responses r where r.workspace_id=link.workspace_id and r.edition_year=link.edition_year and r.participant_id=pid and r.owner_id is null and r.resume_token=secret;
  return jsonb_build_object('year',link.edition_year,'closed',exists(select 1 from public.crm_editions where workspace_id=link.workspace_id and year=link.edition_year and closed_at is not null),'questions',coalesce(qs,public.crm_bureau_default_questions()),'version',coalesce(fv,0),'responses',case when mine is null then '[]'::jsonb else jsonb_build_array(mine) end);
 elsif p_action='save' then
  return public.crm_bureau_write(link.workspace_id,link.edition_year,pid,null,secret,p_values);
 end if;
 raise exception 'Action interdite' using errcode='42501';
end;$$;
revoke all on function public.crm_bureau_public(uuid,text,jsonb) from public;
grant execute on function public.crm_bureau_public(uuid,text,jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
