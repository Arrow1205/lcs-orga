# Lille Card Show — V3, éditions annuelles

Cette mise à jour remplace la sauvegarde globale par des tables distinctes. Aucun import de la version locale n'est nécessaire ni proposé. Les éventuelles fiches déjà enregistrées sur Supabase sont transférées par SQL.

## Éditions annuelles

Le bouton **LCS 2026** en haut à droite ouvre la liste des années et **Ajouter une année**. Les administrateurs et éditeurs peuvent créer une édition ; les lecteurs peuvent consulter toutes les années. Chaque onglet navigateur garde son année sélectionnée.

- Toutes les fiches existantes sont rattachées à **2026**, sans suppression.
- **Contacts** est le seul onglet métier commun : un ajout, une modification ou une suppression y est visible depuis toutes les années.
- Une nouvelle année ne copie aucune fiche. Tarifs, capacités, budget, responsables et prévisionnel repartent à zéro. Les quatre types de zones et les règles par défaut sont disponibles pour la configuration.
- Exposants, partenaires, tâches, communication, déco, idées, assets, factures, réglages et prévisionnel sont isolés par année.
- L’onglet est intitulé **Prévisionnel**, sans année dans son libellé. Son contenu appartient à N et n'est pas transféré automatiquement vers l'édition suivante.
- Les anciennes éditions restent consultables et modifiables par les membres ayant le droit d'écrire. Elles ne sont pas figées en lecture seule.
- Changer d'année demande d'avoir fermé la fiche ouverte et terminé la synchronisation.

## Mettre à jour le projet déjà en ligne

1. Prépare ce dossier dans le dépôt connecté à Vercel ; garde les variables Supabase existantes.
2. Ferme les onglets du CRM après confirmation « Enregistré ».
3. Si la migration **002** a déjà été exécutée, exécute **uniquement `supabase/migrations/003_editions.sql`** dans SQL Editor. Si ta base contient encore seulement les trois tables initiales, exécute **002_records.sql puis 003_editions.sql**, dans cet ordre. Ne relance pas 001 ni le script de création de compte/espace.
4. Déploie ce paquet Vercel (Node 24.x, Vite, `npm run build`, sortie `dist`), puis recharge tous les onglets.
5. Vérifie les données LCS 2026, crée LCS 2027 depuis le bouton et vérifie que les contacts sont communs et les autres listes vides.

Les anciens clients sont volontairement empêchés de sauvegarder après la bascule. Chaque migration SQL est transactionnelle : une erreur annule toute cette migration. Ne supprime aucune table pour contourner un message d'erreur. Aucun import local n'est nécessaire.

## Tables actives

| Table | Contenu |
|---|---|
| `crm_exhibitors` | Exposants, tarifs, tables et attributions |
| `crm_contacts` | Carnet de contacts |
| `crm_partners` | Partenaires, communautés, surfaces, goodies et liens de fichiers |
| `crm_tasks` | Tâches, planning et commentaires |
| `crm_posts` | Communication RS, Presse et Web |
| `crm_expenses` | Déco et budget |
| `crm_ideas` | Idées, montants, auteurs et images |
| `crm_assets` | Références et informations des documents |
| `crm_invoices` | Factures et devis |
| `crm_zones` | Zones et capacités |
| `crm_settings` | Réglages communs et responsables |
| `crm_forecast` | Prévisionnel 2027 indépendant |
| `crm_editions` | Années disponibles dans chaque espace |
| `crm_metadata` | Version et attributs historiques de l'application |
| `crm_history` | Valeurs avant/après chaque changement ou suppression |
| `crm_requests` | Lots déjà confirmés, pour empêcher les doubles écritures |
| `crm_v2_status` | Version de synchronisation de chaque espace |

`crm_members` et `crm_workspaces` restent utilisés. `crm_state` est conservée comme **archive V1** et ne reçoit plus les nouvelles saisies. Les comptes restent dans Authentication et les fichiers dans Storage → `lcs-private`.

Une ligne correspond à une fiche. Les colonnes métier (nom, société, montant, statut…) sont des projections typées et indexables de son `payload` JSON. Celui-ci conserve tous les champs historiques, les commentaires, les événements presse et les champs libres. Ce modèle est un stockage par fiche avec colonnes de lecture, pas une normalisation complète de chaque sous-liste. Les réglages et le prévisionnel constituent chacun une fiche. Ne modifie pas les colonnes calculées dans Table Editor : utilise l'application, qui contrôle les conflits et écrit l'historique.

## Protection des données

- Seules les fiches modifiées sont envoyées. Une modification d'une tâche ne réécrit pas les exposants.
- Deux utilisateurs peuvent enregistrer des fiches différentes depuis des lectures décalées.
- Si la même fiche a changé depuis son ouverture, la sauvegarde est refusée sans écraser celle du serveur.
- Une action portant sur plusieurs fiches est atomique : tout est enregistré, ou rien.
- Un réessai après une réponse réseau perdue conserve son UUID : aucun double enregistrement.
- Un journal temporaire dans le navigateur conserve les modifications non acquittées. Il est supprimé après confirmation serveur. Au retour, une copie non confirmée peut être téléchargée pour réconciliation manuelle ; il n'y a pas de fusion automatique.
- Les anciennes valeurs, y compris les fiches supprimées, sont dans `crm_history`. La fonction administrateur `crm_restore_history` peut annuler une opération si la fiche n'a pas changé depuis. Voir `supabase/04_restaurer_operation.sql`.
- Les fichiers privés ne sont pas supprimés automatiquement lorsqu'une fiche disparaît.
- Règles RLS : seuls les membres lisent leurs données ; seuls administrateurs et éditeurs peuvent sauvegarder. L'historique est réservé aux administrateurs.

**Ces mesures ne constituent pas une garantie absolue de zéro perte.** Il faut également une sauvegarde externe régulière, couvrant les données ET les fichiers. Les sauvegardes de base Supabase n'incluent pas les contenus de Storage : https://supabase.com/docs/guides/platform/backups . Les copies de récupération dans le navigateur ne remplacent pas une sauvegarde indépendante.

## Sauvegarde des données en ligne et fichiers

Le script `scripts/backup-online.mjs` est fourni pour un poste administrateur. Il lit les fiches, l'historique et les documents référencés, puis produit un dossier daté dans `backups/` (ignoré par Git). Pendant l'opération, suspends les modifications pour un jeu cohérent.

Après `npm ci`, renseigne l'URL et la clé publique dans `.env.local`. Dans le terminal, renseigne `LCS_EMAIL` et `LCS_PASSWORD` comme variables d'environnement privées, puis lance :

```bash
node --env-file=.env.local scripts/backup-online.mjs
```

Le fichier `COMPLETE.txt` apparaît uniquement si tous les téléchargements réussissent. Une erreur laisse un dossier partiel sans ce marqueur. Copie le résultat vers un emplacement indépendant et protégé. Le script ne sauvegarde pas les comptes Auth ni la configuration complète du projet Supabase. Aucune sauvegarde planifiée n'est activée par ce paquet.

## Validation

```bash
npm ci
npm test
npm run build
```

Les tests exécutent la migration SQL sur PostgreSQL embarqué (PGlite) avec des schémas Auth simulés. Ils couvrent la conservation des champs et références de fichiers, la base vide, l'annulation sur source invalide, les conflits, les droits, l'atomicité, les réessais et la restauration. La compilation a également été vérifiée. La base Supabase réelle et le déploiement Vercel devront être vérifiés après application du SQL.

Les tests historiques de l'ancien import local restent des tests de non-régression ; cet import n'est plus accessible dans l'application.

Les tables annuelles ont une clé `(workspace_id, edition_year, id)`. Les contacts gardent `(workspace_id, id)`. Les RPC exigent une année explicite ; l’historique et les réessais sont également rattachés à une année. Le script de sauvegarde exporte toutes les éditions.

### Bilan (migration 004)
Après les migrations 002 et 003, exécuter une seule fois
`supabase/migrations/004_bilan.sql` dans le SQL Editor Supabase, puis recharger.
Le Bilan reste désactivé avant cette migration ; les autres pages restent utilisables.

Chaque année possède ses rubriques, ses lignes manuelles et son solde de départ
Compte NC. Les factures de type **Facture** au statut **Payé** alimentent automatiquement
les dépenses, une seule fois par facture ; leur montant suit la fiche source.
Le reclassement conserve ce lien. Les devis et factures non payées sont exclus.
Les ventes et autres dépenses se saisissent manuellement. Le Compte NC intervient
uniquement dans le nouveau solde, jamais dans le résultat ventes moins dépenses.
Les lignes se déplacent entre rubriques d'une même colonne par glisser-déposer
ou par le sélecteur Rubrique sur mobile. Les données bénéficient des mêmes
droits d'accès, sauvegardes par fiche et historiques que les autres modules.


### Planning animations (migration 005)
Après 004_bilan.sql, exécuter une fois `supabase/migrations/005_animations.sql`
dans Supabase, puis recharger l’application. Chaque année conserve son propre
programme. La vue couvre uniquement le jour du salon de l’édition, de 08:00 à 20:00. Sa date est modifiable dans Réglages (3 octobre 2026, 2 octobre 2027). Une
animation contient un nom, des heures de début et fin, un responsable issu
des Réglages, un partenaire facultatif, un prestataire libre et un commentaire.
Les créneaux simultanés sont disposés côte à côte. Sans migration, l’onglet
affiche les instructions d’activation et les autres pages restent disponibles.


### Analyse IA des personas (optionnelle)
Le dashboard calcule les KPI et construit les profils sur les réponses disponibles, sans IA. Le bouton « Approfondir avec l’IA » apparaît lorsque Vercel possède `FEEDBACK_AI_PROVIDER` (`openai` ou `gemini`), `FEEDBACK_AI_MODEL` (un modèle compatible avec la sortie JSON structurée), et `OPENAI_API_KEY` ou `GEMINI_API_KEY`. Redéployer après configuration. Ces secrets restent côté serveur, sans préfixe `VITE_`.

Chaque clic relit les réponses autorisées via la session Supabase de l’utilisateur. L’IA reçoit des agrégats et des verbatims utiles, sans colonnes d’identité ; emails et téléphones présents dans les verbatims sont masqués. L’appel est payant auprès du fournisseur choisi. Les catégories, effectifs, calculs et sources restent déterministes ; l’IA rédige seulement les analyses, marquées « à relire avec les sources ». Aucune migration SQL nécessaire.


### Simulation 2026
La case « Simulation 2026 », disponible dans tous les onglets Feedback de 2026, active une vue projetée sur 2 700 visiteurs classiques, 150 VIP, 150 Early Access, 110 exposants hors partenaires et 5 partenaires. Chaque réponse conserve son identité et reçoit seulement un poids égal à la cible de son groupe divisée par son effectif de répondants. Les coefficients sont calculés sur toutes les réponses avant les filtres de communauté. Les groupes sans réponse et les billets premium non identifiés ne sont pas extrapolés. Les proportions et moyennes restent identiques dans chaque groupe ; les résultats globaux peuvent évoluer du fait du recalage. Les questions non renseignées restent non renseignées. Les volumes sont arrondis uniquement à l’affichage. Les réponses individuelles, exports CSV, critères de génération des personas et appels IA utilisent toujours les données réelles. Aucun enregistrement ni migration SQL.


### Backlog compact et profils membres (migration 017)
Exécuter `supabase/migrations/017_backlog_profiles.sql` après 016, puis recharger l’application et renseigner le prénom de chaque membre dans Réglages → Membres et responsables. Les responsables sont désormais proposés depuis les comptes actifs ; les anciens noms et attributions restent conservés sur les fiches. Les tâches sont liées aux identifiants des comptes, les prénoms sont uniquement leur libellé. Les réalisations et commentaires sont contrôlés côté serveur (compte connecté, horodatage, prénom associé).

Les cartes sont compactes par défaut, sans menu de déplacement. Glisser-déposer déplace les cartes et trie les colonnes. Hors Backlog, les onglets À faire / En cours / Terminé filtrent les cartes sans modifier leur statut. Chaque colonne affiche le total, les retards en rouge et les réalisations en vert. Le statut, la priorité (! / !!!), l’échéance et le nombre de commentaires restent visibles. La couleur d’alerte des tâches en retard se règle dans Réglages ; une échéance n’est en retard qu’à partir du lendemain, heure de Paris.

### Import et création des exposants

La saisie et l’import partagent les champs type (Pro, Particulier, Partenaire, Artiste), nom, prénom, société/pseudo, téléphone, email et nombre de tables. La valeur interne `Collectionneur` reste compatible avec les anciennes fiches et s’affiche comme « Particulier ».

Les colonnes `Type`, `Nom`, `Prénom`, `Société`, `Téléphone`, `eMail` et `Nbre TABLES ?` sont reconnues. `Type` prévaut sur `Tu es un(e)` ; cette seconde colonne sert de complément lorsque le type principal manque. Les exports HelloAsso et le filtrage des billets de tables restent disponibles, sans exiger de référence commande/billet pour les listes simples.

Pro, particulier et artiste : tarif de la page **Le Salon** × nombre de tables (une par défaut). Exposant partenaire : forfait `settings.exhibitorPartnerPrice`, 1 500 € par défaut, configurable dans Le Salon. Ce forfait est indépendant des tarifs table/m² de la page Partenaires. Le montant source CSV est conservé pour référence ; il ne remplace pas le calcul. Une correction manuelle du montant est conservée lors du réimport, ainsi que les choix, la zone et les commentaires. Le réimport rapproche les références HelloAsso ou l’identité (nom/prénom, email, société/pseudo). Les identités ambiguës sont ignorées et signalées plutôt que fusionnées.

**Aucune migration SQL nécessaire pour cette modification** : les champs sont déjà enregistrés dans les fiches JSON de `crm_records`. Les montants des fiches existantes ne sont pas recalculés à l’ouverture.


### Totaux des tables, partenaires et Bilan

L’import affiche « Zone affectée » (nom ou identifiant d’une zone du Salon), sans les sélecteurs référence commande/billet. Les nouveaux exposants sont confirmés par défaut ; une annulation explicite dans le CSV reste une annulation. Les références HelloAsso détectées restent utilisables pour le rapprochement sans encombrer le formulaire.

Les montants automatiques suivent les tarifs actuels du Salon dans les listes, les totaux par communauté et le Bilan. Les corrections manuelles et les anciens montants non nuls sans indication d’automatisme sont conservés. Un ancien montant nul sans correction manuelle est calculé depuis son type et ses tables. Les cartes Basket/Soccer/Sports US/TCG comptent les communautés même sans zone attribuée ; le remplissage des zones reste calculé à partir de l’affectation réelle.

Le Bilan ajoute une ligne source par exposant hors annulation et par partenaire engagé (Accord, Confirmé, Validé, Terminé ou Payé) dans « Tables / Stands ». Les prospects et partenaires refusés sont exclus. Les lignes suivent les montants des fiches et ne sont pas ajoutées plusieurs fois lors des rafraîchissements. Les reclassements manuels restent possibles. Le total des partenaires reprend les mêmes statuts. Les trois KPI financiers de la Vue d’ensemble et leur détail utilisent exclusivement les lignes du Bilan, dont les saisies manuelles, avec des calculs en centimes.

Aucune nouvelle migration SQL : ces calculs sont dérivés des tables existantes. La migration `004_bilan.sql` reste nécessaire si le Bilan n’a jamais été activé.


### Bilan regroupé et implantation

Le Bilan affiche une seule ligne **Tables / Stands** reprenant le total de la page Exposants, et une seule ligne **Partenaires** dans la rubrique Partenaires, reprenant son total. Les anciennes lignes de reclassement par fiche restent enregistrées mais ne sont plus comptées séparément. Chaque total reste synchronisé avec ses sources et peut être reclassé. Les boutons ouvrent les pages source.

Les KPI d’implantation prennent la zone affectée en priorité (identifiant, nom ou alias Football/Soccer et Sports US). Sans zone valide, les tables sont repérées par communauté et signalées **à affecter**. Elles sont distinguées des tables effectivement affectées. Les annulations sont exclues et les tables sans zone ni communauté reconnue sont signalées séparément. Une capacité nulle affiche un tiret plutôt qu’un pourcentage fictif. **Aucun nouveau SQL nécessaire.**
