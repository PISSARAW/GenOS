# ADR 0657 — Port runtime topologique et contrats communs P0

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Morphogenèse, topologies, variants, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0133, ADR 0430, ADR 0654, ADR 0656

## Contexte

Les huit topologies étaient enregistrées par une même fonction, mais pas par une même
frontière runtime. Cinq feuilles passaient par des contrôleurs légers, tandis que Biome,
Holobionte et Métapopulation appelaient directement leurs services canoniques. Le catalogue
de variants ne distinguait pas une variante structurelle, un preset Trinity, un profil
Metapopulation et l'alias `default`. Enfin, les quatre statuts de sortie étaient construits
dans l'exécuteur sans enveloppe versionnée ni identité topologie–variant.

Cette dispersion empêchait de décrire honnêtement les capacités morphogénétiques. Une
fonction présente dans un module pouvait être confondue avec une capacité qualifiée de
snapshot ou de reprise, alors que la preuve de restauration complète n'existe pas toujours.

## Décision

Chaque plugin est désormais exposé par `TopologyRuntimePort` version 1. Le port conserve
l'entrée compatible `run(args, context)` et publie un des trois genres d'exécution :
`canonical_service`, `hybrid_adapter` ou `simulation_adapter`. Il décrit séparément six
capacités morphogénétiques : observer, adapter, quiescer, prendre un snapshot, restaurer et
finaliser. Chaque capacité porte un état explicite parmi `verified`, `declared`, `unknown`
et `unsupported`; la présence d'un code voisin ne vaut donc jamais qualification.

Les contrôleurs légers restent disponibles comme simulateurs ou adaptateurs hybrides. Leur
sortie `simulated_controller` reste non promotable. Rhizome et Biocénose continuent de
déléguer à leur runtime persistant lorsque les identités de session et la base sont fournies.
Biome, Holobionte et Métapopulation restent des services canoniques. Syncytium est déclaré
`simulation_adapter` sur cette surface tant que son raccord de session canonique n'est pas
réalisé et qualifié.

Le registre adopte `VariantSpec` version 2. `specKind` distingue `variant`, `preset`,
`profile` et `alias`. Un vecteur `qualification` sépare catalogue, liaison runtime,
persistance, snapshot, restauration, bout-en-bout et bénéfice empirique. Les états inconnus
restent inconnus : ils ne sont pas dérivés de la maturité documentaire.

Enfin, chaque feuille objet reçoit une enveloppe `topologyOutcome` version 1 contenant
l'identité, les quatre statuts communs et l'éligibilité à la promotion. Les champs historiques
restent au niveau racine pour une migration compatible. La promotion exige simultanément une
preuve d'exécution explicitement promotable, une preuve vérifiée et un outcome mission
vérifié.

## Conséquences

### Positives

- Les huit plugins possèdent un point d'entrée et une description morphogénétique communs.
- Les simulations sont identifiables sans les confondre avec les services canoniques.
- Les consommateurs peuvent différencier alias, presets, profils et variantes sans heuristique.
- Un succès de transport ne devient pas une réussite de mission ni une preuve de restauration.
- Les champs existants et les identifiants de variants restent compatibles.

### Négatives et limites

- P0 n'ajoute pas le raccord canonique Syncytium ni un orchestrateur canonique Trinity/A-Team.
- Les capacités `declared` doivent encore obtenir des campagnes de qualification dédiées.
- La restauration morphogénétique complète reste `unknown` et n'autorise aucun commit de
  transition en production.
- L'enveloppe du port ajoute des métadonnées aux sorties objets ; les consommateurs stricts
  doivent tolérer les champs supplémentaires.

## Alternatives écartées

- Remplacer immédiatement tous les contrôleurs par les runtimes lourds : rejeté, car leurs
  contrats de session, de base et de workers diffèrent et exigent une migration qualifiée.
- Déduire les capacités depuis la présence de méthodes : rejeté, car cela confond
  implémentation, test et preuve opérationnelle.
- Supprimer les quatre statuts historiques : rejeté pour préserver la compatibilité des
  consommateurs pendant la migration.
- Marquer toute variante `implemented` comme qualifiée bout-en-bout : rejeté, car la maturité
  du catalogue ne prouve ni persistance, ni restauration, ni bénéfice empirique.

## Références

- [Plugins des topologies morphogénétiques](../03-reference/plugins-topologies-morphogenese.md)
- [ADR 0133](0133-graphe-morphologique-executable-et-plugins-topologies.md)
- [ADR 0430](0430-fermeture-transition-collective-sans-snapshot-restaurable.md)
- [ADR 0654](0654-contrat-commun-completion-et-preuves-liees.md)
- [ADR 0656](0656-registre-runtime-variants-metapopulation.md)
