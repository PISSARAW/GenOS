# ADR 0078 — Host Holobionte persistant entre missions

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, identité, mémoire, continuité, capacités
- **Décideurs** : GenOS
- **Lié à** : ADR 0052, ADR 0059, ADR 0076

## Contexte

Un Host limité à une mission perd son identité, ses symbiontes résidents et les
capacités déjà acquises dès qu'une nouvelle mission démarre.

## Décision

Le service de continuité ouvre ou réutilise une session de portée `PERSISTENT` par
`hostId`. La reprise conserve la constitution, le phénotype, les symbiontes et le
journal. Chaque nouvelle mission est ajoutée au journal d'événements. Avant
l'exécution, le service compare les capacités déclarées du Host et de ses résidents
aux capacités requises et retourne le manque constaté.

La découverte d'un nouveau partenaire reste séparée de son intégration : la session
persistante permet de reprendre la composition, sans créer ni admettre de symbionte
implicitement.

## Conséquences

### Positives

- La continuité d'identité et de composition est conservée entre missions.
- Les capacités existantes sont comparées aux besoins de chaque nouvelle mission.
- Les liens de mission sont persistés dans le journal append-only.

### Négatives

- Les hôtes persistants nécessitent une gouvernance de cycle de vie explicite.
- Les capacités de résidents sont déclaratives et doivent rester synchronisées avec
  leurs contrats actifs.

## Alternatives

- Recréer un Host à chaque mission : rejeté, car cela détruit la continuité recherchée.
