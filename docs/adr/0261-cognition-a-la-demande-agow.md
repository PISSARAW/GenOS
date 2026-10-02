# ADR 0261 — Cognition à la demande pour les requêtes AGOW

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : AGOW, requêtes actives, voies directes
- **Lié à** : ADR 0006, ADR 0260

## Contexte

AGOW sait enregistrer et résoudre des voies directes consolidées, planifier des requêtes
vers ses modules et estimer un mode cognitif. Il manquait un dispatch runtime qui relie ces
estimations aux organes disponibles et qui limite les voies directes selon l'état courant.

## Décision

Après l'ignition, le cycle du workspace demande une décision à
`cognitiveModeRuntimeService`. Le service enregistre le reçu et route l'action vers les
organes existants : diffusion, requête AGOW, simulation contrefactuelle, exécuteur fourni
par l'hôte ou abstention. Le mode `RECALL` peut interroger la mémoire sans lacune déclarée;
les autres requêtes restent soumises à la détection de lacune.

Le planificateur d'une requête active ne retient une voie directe que si la politique
autorise les voies, si la voie correspond à la capacité et au contexte, si elle n'exige pas
de revue, si sa confiance est au moins 0,9, si l'incertitude est au plus 0,25, s'il n'y a
pas de contradiction et si l'erreur prédictive est sous 0,5. Sinon la requête revient au
dispatch AGOW par attention vers les modules éligibles. Le reçu de planification expose le
mode estimé, le type de route et la raison de la décision. Les erreurs observées sont
persistées et peuvent ajuster les pertes des modes avec un poids plafonné; les priors
restent heuristiques et ne constituent pas des résultats expérimentaux.

## Conséquences

- Une procédure consolidée ne court-circuite pas l'examen AGOW quand le contexte est risqué
  ou incertain.
- L'absence d'une voie fiable conserve le dispatch existant et ses budgets de preuve et
  d'attention.
- Les seuils sont des garde-fous initiaux, pas des performances validées; leur calibration
  demande des campagnes distinctes.

## Alternatives

- Router toute voie consolidée sans vérifier l'état courant : rejeté, car la consolidation
  seule ne démontre pas que la procédure s'applique à cette situation.
- Déclencher une délibération LLM à chaque requête : rejeté, car l'hôte et les receveurs
  disponibles contrôlent l'exécution réelle; AGOW ne doit pas inventer un exécuteur.
