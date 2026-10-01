# ADR 0256 — Protocoles GVX adaptatifs et intégrité du ledger

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, expérimentations, preuves, intégrité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0007, ADR 0249

## Contexte

Le protocole GVX imposait trois mondes Trinity à chaque expérience. La viabilité pouvait
également consommer une mesure ancienne; une expérience achevée pouvait légitimer toute
compétence mentionnée par une transformation; et le ledger immuable ne détectait pas une
altération effectuée hors de son API.

## Décision

Chaque protocole déclare `experimentDesign.type` (`paired`, `trinity`, `multi_arm` ou
`ablation`) et des bras isolés issus d'un snapshot et d'un budget communs. Trinity conserve
ses trois rôles spécialisés; les autres designs définissent leurs propres rôles.

Les mesures interoceptives emploient une fenêtre de fraîcheur configurable, de cinq
minutes par défaut. Une mesure périmée garde sa valeur historique, mais la viabilité la
traite comme inconnue; une mesure future ou mal formée est invalide.

Une compétence n'est soutenue que par une revendication qui nomme exactement cette
compétence, sa métrique, les valeurs baseline/candidate, le sens d'amélioration et des
références de vérificateur présentes dans les preuves valides du même outcome.

Les événements du ledger sont chaînés par SHA-256 selon l'ordre d'insertion et vérifiés
à chaque lecture ou ajout. Les anciennes lignes sont chaînées par migration. Si
`GENOS_GVX_LEDGER_HMAC_SECRET` est configuré, chaque nouvel événement porte aussi un MAC
de contrôle; l'API n'accepte jamais un MAC fourni par le candidat.

## Conséquences

### Positives

- Les protocoles appariés, Trinity, multi-bras et ablation partagent le même gate de preuve.
- Les mesures anciennes ne peuvent pas satisfaire une enveloppe de viabilité.
- L'achèvement d'une expérience ne suffit plus à soutenir une compétence sans preuve
  métrique propre à cette compétence.
- Les altérations du contenu ou de l'ordre du ledger sont détectées avant sa lecture ou
  son enrichissement.

### Négatives

- Les anciens protocoles qui ne déclarent pas `experimentDesign` doivent être migrés par
  leur producteur avant d'être exécutés de nouveau.
- Sans secret HMAC, le ledger détecte les modifications accidentelles mais un opérateur
  capable de réécrire la base et de recalculer toute la chaîne n'est pas authentifié.
- Les preuves de compétence doivent fournir des métriques comparables et des références
  valides dans le même outcome.

## Alternatives

- Forcer chaque expérience à Trinity : rejeté, car cela ajoute des bras sans pertinence
  aux designs appariés et aux ablations.
- Considérer tout outcome terminé comme preuve de compétence : rejeté, car le claim peut
  ne pas correspondre au bénéfice réellement mesuré.
- S'appuyer seulement sur l'immutabilité SQL : rejeté, car elle ne permet pas de vérifier
  les exports, sauvegardes ou écritures hors API.
