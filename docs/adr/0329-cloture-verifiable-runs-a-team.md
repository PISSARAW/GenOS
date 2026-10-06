# ADR 0329 — Clôture vérifiable des runs A-Team

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : A-Team, dispatch, preuve et reprise

## Contexte

Le dispatch explicite ordonnançait les workers sans attendre la validation du dernier étage. Un groupe sans dépendances ne disposait pas de runner de clôture. Le graphe pouvait aussi être compilé avant la fixation des identités persistées. Un succès de transport ne démontre donc pas la réussite du livrable.

## Décision

Chaque run fixe ses identifiants de membres et de workers avant compilation du graphe. Une empreinte du contrat de formation interdit la réutilisation d’une clé idempotente avec des sorties, schémas, dépendances ou critères différents. Le runner travaille depuis le run canonique et contrôle son bail avant chaque dispatch et avant la clôture.

Le scheduler traite chaque dépendance indépendamment. Un producteur échoué, expiré ou sans preuve bloque ses consumers ; une composante indépendante continue. Les workers déjà présents sont conservés lors de la reprise. Le bail est prolongé avant expiration et une ancienne identité de runner ne peut plus promouvoir le run. Le délai initial est persisté : une reprise ne réinitialise pas le temps disponible. Les slots des workers déjà présents sont réutilisables lors de la formation idempotente.

Le suivi persiste les états READY, RUNNING, BLOCKED, SUCCEEDED, FAILED et TIMED_OUT du WorkGraph. SUCCEEDED exige un rapport réussi, les artefacts requis, un schéma valide et des critères évalués avec références de preuve. Un test déclaré non réussi empêche la promotion. Les critères globaux de la mission sont vérifiés séparément. Chaque transfert est lié à une empreinte du contenu, au contrat et à une version ; le consumer doit fournir un accusé évalué avec cette même identité, version, empreinte et ses références de preuve. Une sortie modifiée invalide les accusés précédents.

Les quatre couvertures MCC, TSC, RCA et VEC publient leurs numérateurs, dénominateurs et sources. Dans ce suivi, VEC porte sur les contributions exécutées et validées ; elle ne certifie pas une expertise générale hors mission. Un dénominateur nul reste indisponible.

La clôture attend tous les workers ou le délai, applique le gate d’intégration, puis persiste le débrief, y compris pour un run bloqué. Le parcours autonome utilise le même exécuteur que le dispatch explicite, conserve les identités canoniques et reçoit les mêmes transferts versionnés. Les baux d’outils effectifs des workers sont conservés. La synthèse respecte aussi le refus d’intégration et consulte les preuves du graphe canonique. Le transport des payloads volumineux utilise le mécanisme de fichiers du runner existant.

## Validation

`backend/tests/test_ateam_execution_e2e.js` utilise SQLite en mémoire et de vrais sous-processus Node : exécution acceptée, refus des tests échoués, schémas invalides, critères absents, bail obsolète, timeout et continuation indépendante. Les suites A-Team existantes complètent ces régressions.

## Limites

Ce changement ne transforme pas l’évaluateur isolé des onze variantes en exécuteur de sous-runs. Un événement de planification multiteam reste un plan. La décomposition lexicale d’une mission sans WorkGraph ne devient pas une extraction sémantique vérifiée. Les modèles et expériences conceptuels de la fiche A-Team conservent leurs limites documentées.
