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
