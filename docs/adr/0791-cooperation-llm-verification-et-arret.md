# ADR 0791 — Coopération LLM : vérification sémantique, causes et arrêt

- **Statut** : Accepté
- **Date** : 2026-11-04
- **Domaine** : workers, preuves et qualification

## Contexte

L'expérience réelle du 2 novembre, issue du commit `39c40d308`, a produit deux
abstentions du daemon Qwen. Le reçu exposait une exigence de promotion à la place
de la cause terminale ; le pilote ne comptait que le dernier run et fermait SQLite
pendant une récupération automatique. Le contrat natif réutilisé ne définissait
pas l'oracle des observations génératives. Cette expérience ne qualifie pas la
coopération complète. Le détail est conservé dans la fiche de preuve du 4 novembre.

## Décision

1. Les nouveaux reçus biologiques conservent séparément `failureReason`,
   `promotionReason` et `terminalEvent`. `reason` privilégie la barrière réellement
   persistée sur le run, puis l'échec terminal, puis l'exigence de promotion.
   Les reçus historiques immuables ne sont pas réécrits.
2. Un dispatch de récupération est suivi dès son admission, avant tout accès
   asynchrone à la file durable. Un deuxième dispatch de la même identité est
   refusé. Le pilote annule les admissions et la file, attend écritures, dispatchs
   et tâches de mission, puis ferme sa base isolée. Un délai d'arrêt dépassé
   interdit cette fermeture et la qualification.
3. Le contrat workspace `resource_allocation` est scellé avant chaque appel
   génératif : sources SHA-256 immuables, indices depuis zéro, mode `observation`,
   `candidate` ou `verification`. Le domaine se limite à 24 entiers naturels
   bornés. Les deux processus d'oracle recalculent par sélection indicée et par
   parcours des valeurs avec accumulation BigInt. Ils contrôlent la vérité de
   l'observation, la somme de la proposition et la cohérence du verdict.
4. Le pilote versionné accepte une proposition LLM bornée sur quatre rôles,
   exige des reçus sémantiquement vérifiés pour chaque étape et transmet les
   références de runs et de sources. Seul `recovery_worker` restaure un checkpoint
   dans sa capsule avec un bail explicite. Il n'y a pas de promotion source.
5. Le rapport énumère tous les runs enfants, échecs et identités de récupération
   compris, et ajoute le coût du plan. Il conserve la mesure du plan sans cache
   implicite. Les clés locales nécessaires à l'inspection ultérieure restent dans
   le répertoire privé du run, hors Git et hors rapport public.

## Conséquences

Une abstention reste un échec exploitable et ne devient pas un succès par simple
validation JSON. Les gates d'autorité, d'intégrité, de budget et de promotion
continuent de s'appliquer. Les tests de transport contrôlé n'attestent aucune
réussite d'un vrai LLM. La cause exacte des deux abstentions historiques nécessite
encore une comparaison contrôlée des prompts et du modèle.

## Alternatives

- Désactiver la vérification indépendante : rejeté, cela supprimerait la preuve.
- Compter seulement le dernier run : rejeté, les reprises ont un coût réel.
- Attendre seulement la télémétrie : insuffisant pour les dispatchs asynchrones.
- Présenter le protocole natif comme une qualification LLM : rejeté, les portées
  expérimentales sont distinctes.
