# ADR 0202 — Handoff daemon actualisé au démarrage d'une mission

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Daemons résidents, cartographie, orchestration
- **Décideurs** : GenOS maintainers
- **Lié à** : ADR 0034, ADR 0201

## Contexte

Le daemon résident connaît déjà le workspace et compile un dossier au début d'une
mission. Son HEAD et son graphe peuvent toutefois dater d'un état antérieur au
workspace courant. Un handoff fondé sur cet état risque de présenter des findings
comme actuels ou de manquer les fichiers récemment modifiés.

## Décision

À l'entrée de mission, le pont cherche un territoire déjà enregistré. Il compare
son HEAD au `HEAD` Git du workspace, calcule une liste bornée de fichiers changés,
avance le territoire, marque les findings de l'ancien HEAD comme obsolètes et
réindexe uniquement ces fichiers avant de compiler le handoff. Aucun territoire
n'est créé implicitement. Une comparaison ou un rafraîchissement impossible est
signalé comme dégradé et n'est jamais présenté comme un succès.

Le brief expose des références d'architecture, régressions et contradictions
persistées, tests, dead ends, sections obsolètes et cibles d'inspection. Il reste
borné et le signal de réveil ne transporte que l'identifiant du brief.

## Conséquences

### Positives

- Le handoff se rapporte au HEAD courant quand un rafraîchissement sélectif réussit.
- La connaissance existante est réutilisée sans réindexation complète.
- Les limitations de fraîcheur restent visibles.

### Négatives

- Le rafraîchissement dépend de Git et de l'accessibilité du workspace.
- Les changements trop nombreux ou les chemins ambigus entraînent une dégradation
  explicite plutôt qu'une synchronisation partielle silencieuse.

## Alternatives

- Réindexer tout le workspace à chaque mission : rejeté, coût inutile.
- Utiliser un diff non borné : rejeté, latence et consommation mémoire imprévisibles.
- Faire confiance au HEAD du daemon : rejeté, la fraîcheur serait supposée.
