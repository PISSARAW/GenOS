# ADR 0332 — Rhizome : exécution vérifiée et télémétrie réelle

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Rhizome, routage, croissance, preuves et télémétrie
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [0130](0130-runtime-comportemental-des-variants-rhizome.md), [Rhizome](../02-orchestration/topologies/rhizome.md)

## Contexte

Un arrêt après quelques routes stables pouvait omettre des besoins explicites. La croissance vérifiait une admission sans débiter son coût. Le runtime ne réunissait pas les résultats signés dans une condition de complétion. Le CLI affichait un graphe simulé comme une télémétrie. Des suppressions individuellement acceptables pouvaient couper ensemble une route requise.

## Décision

Le contrôleur traite chaque besoin, réexécute le besoin après croissance, borne les ticks et la durée, et retourne VERIFIED uniquement lorsque tous les besoins possèdent une exécution vérifiée et que la politique de convergence passe. La couverture ne vient pas des capacités déclarées : elle compte les résultats indépendamment signés, encore valides et atteignables. Les métriques, références, latences mesurées et reçus sont persistés. Un résultat historique dépourvu d'empreinte de sortie ne compte pas comme exécution de mission.

L'exécution capture une représentation JSON déterministe de la sortie. Le vérificateur reçoit une copie et l'empreinte SHA-256. Le reçu de route signé inclut cette empreinte ; une sortie différente, un reçu rejoué ou un chemin devenu indisponible ne peut renforcer les preuves. Les opérations transmettent un AbortSignal et ont une échéance ; l'hôte doit respecter ce signal pour arrêter ses effets externes.

L'admission de croissance revalide le gap et le plan à la version courante, lie cryptographiquement le provider, l'instance et les contrats d'arêtes, impose les limites de branches et de profondeur, puis active le nœud et débite création plus coordination dans la même mutation. Les mutations mémoire utilisent une copie de travail ; les mutations persistantes utilisent la transaction du store existant. Une admission refusée conserve le budget et le graphe précédents.

Les six types de providers peuvent être enregistrés avec des opérations concrètes start, probe, execute et stop. Une instance exige une identité et une sonde AVAILABLE portant des références de preuve avant admission. Un échec de sonde ou d'admission libère l'instance. La méthode close du runtime libère les instances enregistrées avant fermeture ; un échec de libération conserve la session pour permettre une reprise. Les anciens adaptateurs restent gérés par l'hôte.

Le routage conserve son classement déterministe par défaut et offre une sélection softmax explicite, avec tirage injectable. Les états et inspections d'arêtes sont bornés. Les paramètres d'appel ne peuvent neutraliser la politique privée. Les variantes privées, persistantes, procédurales et inter-représentations résistent aux changements automatiques de politique. La maintenance applique la décroissance aux traces de matrice et d'arêtes. Le pruning compare la connectivité du plan combiné depuis les mêmes sources qu'avant suppression. Le transfert de locus impose un seuil de fiabilité et utilise le bail calculé sur la stabilité observée, ou le bail minimal en l'absence d'exécution vérifiée.

Le CLI live exige une session et une base SQLite régulière confinée au workspace. Un pont Node lit le graphe canonique dans une transaction en lecture seule. Les exports et endpoints annoncent source=backend ; une erreur de source retourne une erreur. La démonstration exige --simulate et ses snapshots annoncent source=simulation. Aucun score de preuve synthétique n'est injecté dans le graphe live.

## Conséquences

### Positives

- Les états composé, routé, exécuté, admis et vérifié restent distincts.
- Les preuves survivent à une reprise SQLite sans renforcer deux fois une route.
- Les métriques de convergence sont dérivées du registre d'exécution.
- Les catalogues MCP exposent les métriques, la maintenance, les variantes, le pruning et la croissance vérifiée.

### Négatives

Les reçus de capacité anciens doivent être réémis avec l'identité du provider et les contrats d'arêtes ; les nouveaux vérificateurs de route doivent signer executionDigest. La télémétrie live du CLI dépend de Node et des dépendances backend. Une fonction fournie par l'hôte ne constitue pas une sandbox ni une preuve de disponibilité permanente. Les callbacks restent responsables de leur autorité, isolation, annulation et idempotence.

La fitness calculée est une moyenne de compatibilité, succès et qualité de preuve des ponts utilisés ; la stabilité est la couverture vérifiée. Ces indicateurs ne sont pas une estimation statistique biologique. canMerge ne remplace pas les gates de promotion de niveau supérieur. Les benchmarks synthétiques ne démontrent aucune performance de production.

## Alternatives

- Déclarer une mission réussie après sélection de route : rejeté, faute de résultat vérifié.
- Débiter le budget avant le démarrage et garder le débit après refus : rejeté, faute d'admission atomique.
- Continuer à exporter un simulateur implicitement : rejeté, car la source doit être explicite.
- Supprimer selon des décisions indépendantes par arête : rejeté, car la connectivité doit être conservée pour le plan entier.
