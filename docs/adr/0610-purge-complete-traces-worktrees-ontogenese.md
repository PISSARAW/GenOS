# ADR 0610 — Purger les traces et worktrees de l’Ontogenèse

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : Ontogenèse, rétention, confidentialité, Git, exploitation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0235, 0334, 0606, 0607 et 0609

## Contexte

La rétention bornée existante retire seulement certains événements, notifications,
requêtes et capsules terminales inchangées. Elle ne répond pas au besoin de retirer
à la demande toutes les traces d’un projet arrêté, notamment les mémoires,
journaux, reçus d’exécution, données d’observabilité et worktrees gérés.

Une suppression récursive non bornée ou une purge pendant une exécution pourrait
effacer des changements humains, rompre une bascule distante ou détruire une preuve
soumise à un gel juridique. À l’inverse, conserver silencieusement des contenus
opérationnels contredirait la promesse d’une purge complète.

## Décision

Une commande distincte `purge` réalise une destruction explicite et fail-closed :

1. elle exige `--project ID --confirm ID` avec égalité exacte ;
2. le projet et son contrôle doivent être arrêtés, la continuité doit être locale,
   et aucune exécution ou opération ne doit rester active ;
3. tout artefact sous gel juridique bloque l’opération entière ;
4. un claim exclusif couvre l’inventaire, la suppression Git et la transaction SQL ;
5. seuls les worktrees enregistrés sous la racine déterministe
   `.genos/ontogenesis/<hash-projet>` sont retirés par Git ; la racine gérée restante
   est ensuite supprimée sans suivre de lien symbolique ;
6. les traces Ontogenèse et les données projet de `trace_spans`,
   `telemetry_events`, `telemetry_hourly_stats` et `audit_logs` sont supprimées ;
7. projet, configuration, backlog, canaux, hôtes, échéances et contrôle arrêté sont
   conservés ;
8. un reçu minimal, sans contenu ni chemin d’artefact, persiste l’empreinte du plan,
   les compteurs supprimés et l’issue. Un reçu terminal est immuable.

`--dry-run` expose l’inventaire sans créer de claim ni supprimer de donnée. Une
reprise après crash réutilise un reçu `prepared`; les suppressions de fichiers et
de lignes sont idempotentes.

## Conséquences

### Positives

- les contenus conversationnels, opérationnels et d’observabilité sont retirés
  avec les worktrees temporaires ;
- la confirmation, l’arrêt, le claim et le confinement de chemin réduisent le
  risque d’effacer le mauvais projet ;
- les gels juridiques et la continuité distante restent prioritaires ;
- le reçu minimal permet d’attester l’opération sans conserver son contenu.

### Négatives

- la purge est irréversible et les traces supprimées ne peuvent plus servir au
  diagnostic ou à la reprise ;
- l’opérateur doit d’abord achever l’arrêt et reprendre localement une continuité
  distante ;
- le squelette du projet et le reçu de purge restent en base : il ne s’agit pas
  d’une suppression du projet lui-même.

## Alternatives

- **Étendre `prune --artifacts`** : rejeté, sa sémantique de rétention prudente et
  temporelle ne doit pas devenir destructrice par surprise.
- **Supprimer le projet avec cascade SQL** : rejeté, cela ne nettoie pas sûrement
  les worktrees Git et ne laisse aucun reçu minimal.
- **Forcer malgré un gel juridique ou une continuité distante** : rejeté ; une
  nouvelle autorité explicite serait nécessaire pour une telle opération.

## Preuves

`backend/tests/test_ontogenesis_complete_purge.js` couvre l’arrêt obligatoire, le
gel juridique, la confirmation, le dry-run, la suppression des deux worktrees et
des traces SQL, la conservation du backlog et l’immutabilité du reçu.
