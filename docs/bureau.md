# Bureau — bilan post-événement

1. Exécuter entièrement `supabase/migrations/20261025110331_bureau_review.sql` dans le SQL Editor Supabase. Le script est transactionnel et peut être réexécuté. Il ne modifie pas les formulaires existants.
2. Ouvrir **Feedback → Bureau** dans l’année voulue. La page initialise un lien public aléatoire propre à cette édition.
3. Copier **Lien public à partager avec le bureau**. La page `/formulaire/bureau.html?code=…` ne demande aucun compte. Chaque navigateur conserve son identifiant de reprise ; utiliser le même navigateur pour continuer un bilan. Six répondants maximum par édition, sans création de réponses fictives.
4. La synthèse et les contrôles d’administration restent dans le CRM, soumis aux droits existants. Les lecteurs peuvent consulter ; administrateurs et éditeurs peuvent modifier le questionnaire et créer des actions.

## Réponses et confidentialité

Une réponse est enregistrée progressivement, question par question, avec un numéro de version et un identifiant de requête pour éviter les doublons lors d’une relance. Le navigateur garde les modifications en attente dans l’onglet en cas de coupure. En cas de conflit entre onglets, exporter le brouillon avant de recharger les données partagées. Le lien public ne permet ni de lire les autres bilans, ni d’éditer ou de dupliquer le questionnaire. La reprise d’un bilan public exige en plus un secret privé conservé par ce navigateur.

La clôture d’une édition bloque aussi les écritures du lien public. La duplication copie uniquement les questions vers une autre édition ouverte. Les réponses existantes et leurs libellés au moment de la réponse sont conservés ; les questions retirées restent archivées dans la synthèse et l’export.

## Calculs et export

La note globale est la moyenne des notes 1–5 renseignées. Les choix uniques, textes et valeurs manquantes ne sont pas transformés en notes. La progression compte les réponses valides aux questions actives. Les moyennes par catégorie excluent les catégories sans note.

Q18 et Q19 demandent un point par ligne. Les compteurs de points forts/faibles comptent ces lignes déclarées, sans inférer des points à partir d’un paragraphe. Les résultats par question détaillent au plus six bilans dans un accordéon.

L’export CSV comprend les questions, réponses, commentaires, libellés historiques, statistiques et actions. Si une sauvegarde est bloquée, l’export propose à la place une copie JSON du brouillon local. Les actions créées depuis une question réutilisent les tâches du Backlog de l’édition : responsable, priorité, échéance, statut et description restent gérés par ce module.
