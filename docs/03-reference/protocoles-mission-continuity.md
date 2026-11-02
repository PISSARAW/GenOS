# CONTINUITY dans le runtime de mission

`missionProtocols/continuity.js` relie les vraies classes `ContinuityHandoff`
et `FencedResource` à l'autorité native des missions et aux écritures de
progression. Ce branchement ne s'appuie pas sur une autorisation constante :
chaque phase consulte le contexte scellé, la portée native, l'autorité courante
et l'enveloppe d'exécution.

## Points d'insertion

Le runtime commun appelle `initialize(binding)` après scellement,
`beforeExecution(binding)` avant lancement et `beforeEffect(binding,event)`
avant l'application native de l'événement. Le dernier contrôle et la progression
SQL restent dans le même `withTransaction(db)`. La succession emploie ce même
mutex : un événement déjà admis termine sa transaction avant le checkpoint,
ou voit ensuite sa génération refusée.

La clé d'autorité est `{scope,missionId,workspaceId,agentId}`. Deux workers d'une
même mission partageant le même workspace ont chacun leur propre autorité.
Deux runs du même agent constituent deux incarnations : le nouveau run scellé
ne devient propriétaire qu'après `OFFER_HANDOFF → SEAL_CHECKPOINT →
ACCEPT_RESPONSIBILITY → ACTIVATE_SUCCESSOR`. La génération de ce fence avance
de un ; elle est distincte de la génération du bail natif. Un transfert entre
agents différents n'est pas déduit d'un workspace partagé.

## Checkpoint et responsabilité

Le checkpoint conserve réellement les lignes `missions`, `mission_agents`,
`strategy_execution_runs` et `strategy_execution_steps` du run source. Leur
digest est vérifié avant scellement. Les étapes non terminées deviennent des
obligations attribuées au successeur, avec référence au checkpoint conservé.
Un effet inconnu représentant le run précédent reste explicitement présent :
un statut de fin ou une succession n'atteste pas les effets externes du run.

Le fence n'accorde que le droit local `strategy_progress`, avec coût zéro et
budget fermé `{unit:"authority_checks",limit:0,spent:0,reserved:0}`. Ce profil
n'invente et ne transfère aucune dotation de tokens ou de monnaie. Les vrais
budgets et métriques sont conservés dans le checkpoint ; leur admission et leur
règlement restent natifs ou relèvent d'ALLOSTASIE.

## Effets, reprise et limites

Les fichiers SQLite du fence et de la conversation sont dérivés du chemin de
la vraie DB et de la clé d'autorité. Aucun chemin distant n'est interprété.
Le registre natif conserve le run courant et sa révision par CAS.

Le transfert d'autorité est durable avant sa projection dans le registre de
mission. Si la transaction native échoue après ce transfert, l'ancien run reste
fencé. Une nouvelle initialisation du successeur relit la même conversation
activée et répare cette projection, sans incrémenter encore la génération.
L'initialisation répétée du run courant ne crée pas de transfert supplémentaire.

`beforeEffect` retourne une autorisation locale. Le reçu `applied` interne au
fence concerne son registre de contrôle ; il ne prétend pas prouver que la
progression native ou un effet externe est déjà appliqué. Les écritures natives
restent sous leur transaction et leurs propres conditions d'idempotence.
Les champs `undefined` natifs sont omis dans l'empreinte comme dans le JSON
effectivement persisté.

Les callbacks de contexte sont des lectures ou décisions sans effets de bord.
Cette intégration ne rend pas atomiques des providers asynchrones arbitraires.
Elle protège les points d'écriture branchés dans le runtime ; elle ne fournit
ni consensus distribué, ni arrêt physique de processus, ni révocation d'un
endpoint externe qui ignorerait les générations.

## Vérification

```text
node backend/tests/test_mission_protocols_continuity.js
node backend/tests/test_mission_protocols_continuity_races.js
```

Les suites utilisent de vraies missions et de vrais runs scellés. Elles
vérifient les métriques SQL réellement écrites, le refus d'une ancienne
incarnation, l'indépendance de deux workers, la race succession/écriture et la
reprise après interruption entre transfert durable et commit du registre natif.
