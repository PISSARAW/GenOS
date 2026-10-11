# ADR 0399 — Commit versionné et profil morphologique dans le graphe

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Morphogenèse, transitions et profils de topologie
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0110, ADR 0124, ADR 0133

## Contexte

Le `PatchExecutor` pouvait déclarer une transition `committed` sans committer
injecté. Dans ce cas, seul un graphe en mémoire était produit. Le planificateur
transmettait aussi le profil multidimensionnel dans les métadonnées d'une
expression, mais l'aplatissement du graphe ne le conservait pas sur la feuille.
Ces deux écarts rendaient le reçu de transition et la configuration exécutée
insuffisants pour une reprise ou une vérification fiable.

## Décision

1. Une exécution de patch exige un committer versionné avant la phase
   contrefactuelle. Sans lui, elle échoue explicitement et ne prend jamais le
   statut `committed`.
2. Le résultat du committer doit confirmer `committed: true`. Le vérificateur,
   l'adjudicateur et les autres gates restent obligatoires.
3. Le profil de topologie résolu traverse l'expression dans
   `metadata.topologyProfile` et devient `localProfile` sur la feuille compilée.
   Les autres métadonnées des opérateurs ne sont pas interprétées comme profil.
4. Le préparateur de mission valide un couple topologie–variant explicite dans
   le catalogue central et conserve la sélection dans la morphologie, les
   métadonnées de l'agent et la télémétrie. Il fournit les membres réels au
   calcul de capacité du garage. Pour une topologie reconnue sans
   variant explicite, il applique le sélecteur local et conserve son reçu.
5. Ce contrat ne prétend pas activer le commit gouverné dans le parcours public
   `genos-orchestrate` : ce parcours doit encore fournir les services réels de
   décision Rust, gouvernance, transition et persistance.

## Conséquences

### Positives

- Un graphe temporaire ne peut plus être rapporté comme version commitée.
- Le profil et le variant sélectionnés restent observables dans le graphe.
- Une requête de variant inconnu ou incompatible est refusée avant le dispatch.
- Les appelants sans committer reçoivent un refus exploitable.

### Négatives

- Les intégrations qui s'appuyaient sur un succès en mémoire doivent injecter
  un committer conforme ou traiter le résultat comme une simulation distincte.
- Le profil augmente la taille du graphe sérialisé ; ses données doivent rester
  dans les limites de la politique de persistance de la mission.

## Alternatives

- Conserver le repli en mémoire avec `committed: false` : rejeté, car plusieurs
  appelants interprétaient `success` comme une transition achevée.
- Injecter un committer factice par défaut : rejeté, car cela fabriquerait une
  preuve de persistance.
