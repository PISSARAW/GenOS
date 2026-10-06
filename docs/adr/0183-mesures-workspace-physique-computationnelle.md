# ADR 0183 — Mesures workspace et profils physiques par mission

## Statut

Accepté — décision initiale, précisée par l'[ADR 0327](0327-mesures-et-calibration-physique.md).

## Date

2026-09-30

## Domaine

Orchestrateur Rust, télémétrie workspace, apprentissage et persistance.

## Lié à

`docs/01-concepts/physique-computationnelle.md`.

## Suivi de livraison — 2026-10-06

L'[ADR 0327](0327-mesures-et-calibration-physique.md) décrit le contrat livré :
mesures sourcées du contexte, manifests et imports locaux, rapports de couverture,
coûts ATP et durées observés, profils versionnés sauvegardés et rechargés
automatiquement dans `.genos/physical-profiles/` via `SnapshotStore`.
Les profils restent exportables dans `DirectorState` ; leur persistance automatique
dispose de son propre répertoire confiné. Les seuils physiques de sécurité restent fixes.

Le contexte et les alternatives ci-dessous retracent l'état initial du
2026-09-30. Pour les API, limites et commandes actuelles, consulter la
[fiche](../01-concepts/physique-computationnelle.md).

## Contexte

La couche physique computationnelle est appelée dans `tick()`. Elle utilise des
mesures bornées (fichiers, Git, budget CI), mais ne mesure ni la taille du
contexte de décision, ni le graphe de dépendances, ni une couverture de tests
réelle. Ses constantes restent codées en dur et ne sont pas différenciées par
mission.

## Décision

1. Ajouter des mesures workspace optionnelles, avec source et statut explicites.
   La couverture est lue uniquement depuis un rapport reconnu; les dépendances
   ne sont décrites que dans le périmètre des manifestes analysés. Une donnée
   absente n'est jamais inventée.
2. Ne collecter que des mesures bornées et best effort. Les erreurs de lecture
   ne bloquent pas `tick()`.
3. Classer les profils par identifiant stable de `Goal`, non par texte libre.
4. Persister les profils dans l'état sérialisable du directeur, dans le coffre
   de snapshots déjà utilisé par l'orchestrateur. Les anciennes sauvegardes
   chargent une map vide par défaut.
5. Apprendre uniquement depuis les résultats observés, lisser les mises à jour,
   imposer un minimum d'épisodes et borner chaque paramètre. En cas de profil
   absent ou invalide, conserver les paramètres par défaut actuels.
6. Considérer toutes les valeurs obtenues comme des heuristiques de contrôle;
   aucune mesure ni constante apprise ne constitue une preuve métier.

## Conséquences

### Positives

- Les décisions peuvent tenir compte de mesures réelles du dépôt quand leurs
  sources sont disponibles.
- Les réglages acquis survivent au redémarrage et restent séparés par type de
  mission.
- L'absence de mesure ou de profil conserve un chemin de décision sûr.

### Négatives

- La couverture dépend du format et de la fraîcheur du rapport présent.
- Le graphe de dépendances décrit uniquement les écosystèmes parsés.
- Le contexte est mesuré en octets sérialisés; cette mesure n'est pas un compte
  exact de tokens du modèle.
- Les premières pondérations apprises restent des heuristiques à évaluer.

## Alternatives

- Faire échouer une mission si une source de mesure manque : rejeté, car la
  télémétrie est facultative et ne doit pas compromettre `tick()`.
- Persister dans un nouveau magasin spécifique : rejeté au profit du coffre de
  snapshots déjà utilisé par le directeur.
- Apprendre des poids non bornés ou à chaque tick : rejeté pour limiter les
  dérives dues à des épisodes isolés.
