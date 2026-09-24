# ADR 0085 — Variant Hiérarchique pour Syncytium

## Statut

Accepté — lot 23 du plan Syncytium.

## Date

2026-09-24

## Domaine

Syncytium, coordination multi-région et réplication sélective.

## Lié à

Phase 41 de la feuille de route Syncytium.

## Contexte

Un Syncytium destiné à des centaines ou milliers d'agents ne doit pas donner à chaque agent une vue identique de tout l'état. Les régions doivent échanger les contrats et invariants de frontière, tout en gardant leurs champs locaux dans leur domaine.

## Décision

1. Déclarer chaque région comme domaine nucléaire avec membres, champs locaux et accès aux contrats communs.
2. Stocker les champs locaux avec `visibility: PRIVATE` et `replicationPolicy: OWNER_ONLY`.
3. Stocker les contrats de frontière avec `visibility: GLOBAL` et les répliquer vers les domaines abonnés.
4. Ajouter des opérations et transactions régionales qui fixent le domaine source avant l'autorisation.
5. Produire une projection régionale avec ses champs locaux visibles et l'état de frontière explicitement identifié.

## Conséquences

### Positives

- Les agents d'une région reçoivent les détails locaux et les contrats communs, sans les détails privés des autres régions.
- Le routage existant distribue les deltas aux domaines intéressés plutôt que de cibler chaque agent individuellement.
- L'autorisation vérifie que l'acteur appartient à la région déclarée et peut écrire le champ visé.

### Négatives

- Le nombre de domaines correspond aux régions plus un domaine organisme; le choix de leur taille reste opérationnel.
- Ce lot expose le découpage et les projections, mais n'ajoute pas un protocole de transport inter-région indépendant.

## Alternatives

- Un champ global unique par organisme : écarté, car il diffuserait les détails locaux.
- Un domaine pour chaque agent : reporté, car les régions constituent le grain de synchronisation souhaité.
