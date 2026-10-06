# ADR 0327 — Mesures et calibration persistante de la physique computationnelle

- Statut : accepté
- Date : 2026-10-06
- Précise : [ADR 0183](0183-mesures-workspace-physique-computationnelle.md).
- Contrat opérationnel : [fiche de physique](../01-concepts/physique-computationnelle.md).

## Contexte

La couche physique est intégrée à `tick()`, mais le contexte se limitait à un
vecteur de caractéristiques, les dépendances aux manifests et la calibration
à un multiplicateur dérivé du taux de succès. Les erreurs d'acquisition et la
durabilité des constantes étaient insuffisamment visibles.

## Décision

Séparer les contrats de mesure, collecteurs bornés, calibration descriptive,
stockage de profils et politique physique.

Chaque observation porte source, horodatage, état et diagnostic. Les imports
locaux résolus forment un graphe; la couverture est validée contre l'âge du
rapport et les dates des sources. Le contexte de décision est sérialisé dans
son ensemble; l'appelant peut fournir les octets et tokens du contexte modèle.

Les coûts ATP consommés et les durées exécutées alimentent des moyennes et
dispersions par mission et concept. Après trois observations, des références
bornées modulent les indices et le score. Les seuils de sécurité restent fixes.
La réussite est observée sur l'écosystème après exécution.

Les profils versionnés réutilisent `SnapshotStore` dans un répertoire confiné
au workspace. Chargement et sauvegarde sont automatiques. Les profils invalides
sont exclus, les erreurs sont exposées, les anciens exports restent lisibles.

Les coûts physiques interviennent dans les expansions de la recherche et le
classement des plans, avec préconditions, budget, régimes et inertie.
Les reçus de décision et calibration rendent ces choix inspectables.

## Alternatives

- Garder les compteurs et taux de succès : ne mesure pas les coûts réels.
- Ajouter une base dédiée : duplication inutile du stockage existant.
- Apprendre les seuils de sécurité : risque de relâcher les protections.
- Présenter les imports statiques comme le graphe complet : affirmation injustifiée.

## Conséquences

Les acquisitions ont un budget de temps et de lecture, et un cache explicite.
Un résultat partiel reste exploitable de façon bornée; il n'entraîne pas la
référence de taille du graphe. L'analyse JS/TS est limitée aux imports statiques;
les macros, alias et résolutions dynamiques ne sont pas intégralement interprétés.

Le stockage est append-only et comporte un plafond de 10 000 fichiers au
chargement. Un répertoire non sûr ou trop volumineux est signalé comme indisponible.
Les reçus de contrôle ne remplacent aucune preuve métier ni autorisation de mutation.

## Validation

Contrats exécutables dans `physical_measurement_contract.rs`,
`physical_calibration_contract.rs` et `physical_policy_contract.rs`, complétés
par la suite de l'orchestrateur et les gates du monorepo.
