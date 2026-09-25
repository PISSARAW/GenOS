# 0126 — DSL de plan expérimental Trinity

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Trinity, plans expérimentaux, preuves et orchestration
- **Lié à** : [ADR 0124](0124-selection-automatique-des-variants.md), [ADR 0125](0125-profils-morphologiques-composables.md)

## Contexte

Les variants Trinity mélangent topologie des mondes, politique d'hypothèse, diversité,
interaction, objectifs, horizon temporel, réplication et adjudication. Un enum de douze
valeurs empêche de combiner ces axes et suggère à tort que chaque combinaison a un moteur
complet.

## Décision

Décrire une expérience au moyen d'un `experimentalDesign` composé des huit axes indépendants
suivants : `worldTopology`, `hypothesisPolicy`, `diversityPolicy`, `interactionPolicy`,
`objectivePolicy`, `temporalPolicy`, `replicationPolicy` et `adjudicationPolicy`. Les axes
omis prennent les valeurs du baseline contrôlé à trois mondes. Un compilateur résout les
politiques, calcule la maturité, les limites d'exécution, les adaptateurs requis et un
`experimentalDesignId` déterministe.

Les noms historiques restent acceptés comme préréglages vers le DSL. Une composition n'est
exécutable que si chaque politique est connue, non conceptuelle, ses préconditions sont
satisfaites et les adaptateurs requis sont présents. Les politiques partielles peuvent être
explicitement demandées; leurs limites restent dans le reçu. Les barrières de preuve,
l'isolation des mondes et les règles de promotion ne sont jamais affaiblies par le DSL.

## Conséquences

- Des politiques indépendantes peuvent être combinées sans créer un variant monolithique.
- Le plan et chaque worker conservent la composition, sa maturité et son identifiant.
- Les capacités manquantes produisent un refus explicite avant lancement.
- Les combinaisons partielles influencent les consignes ou activent les adaptateurs déjà
  disponibles; elles ne sont pas présentées comme des moteurs complets.

## Alternatives

- Ajouter un identifiant enum pour chaque combinaison : espace combinatoire non borné et
  répétition de configuration.
- Accepter librement toutes les combinaisons : permettrait de demander des politiques sans
  adaptateur et de présenter un plan conceptuel comme exécuté.
