# ADR 0330 — Missions Holobionte contractuelles et vérifiées

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Holobionte, exécution, immunité, ressources et persistance
- **Lié à** : [0277](0277-workflows-persistants-holobionte.md), [0104](0104-dysbiose-holobionte.md)

## Contexte

Le compositeur historique déclarait une activation sans exécution. Le cycle persistant acceptait un retour d’adaptateur sans exiger un vérificateur indépendant lié au résultat. L’allocation pouvait survivre à un succès, et le registre de contribution et la mémoire pouvaient diverger lors d’une erreur. La santé restait un conseil sans boucle de gouvernance intégrée.

## Décision

Un service de mission commun ouvre ou retrouve l’hôte, découvre les candidats explicitement fournis, crée leur contrat, conduit leur essai, sélectionne les résidents, exécute les étapes et termine la mission. Morphogenesis utilise ce service pour ses missions par capacité. La CLI conserve aussi le chemin des variants persistants. La composition historique retourne COMPOSED et ne certifie aucune activation ; la composition avec une base ouvre une session en attente d’admission.

L’exécuteur et le vérificateur sont des adaptateurs explicites. L’admission exige aussi un adaptateur d’essai. Un reçu VERIFIED doit porter une empreinte SHA-256 du résultat concret, des références non vides et une identité de vérificateur distincte du producteur. Le résultat et la consommation ne peuvent changer pendant la vérification. Le contrôle immunitaire de l’hôte inspecte la sortie réelle avant toute contribution ou mémoire.

Avant exécution, l’hôte doit être actif et les révisions de session et de contrat cohérentes. Les capacités, baux d’outils, classes de données et limites d’autorité doivent être autorisés. Le contrat est relu dans la transaction de promotion pour bloquer sa révocation concurrente. Contribution, mémoire et événement CAPABILITY_USED sont atomiques. L’allocation est libérée en finally, y compris après révocation ou annulation.

Les allocations existantes sont soustraites de la capacité disponible. La mission compte les jetons consommés par les essais et les étapes, borne le nombre d’étapes et transmet un AbortSignal avec échéance aux adaptateurs. Un worker tardif ne peut promouvoir son résultat après annulation. Les étapes ne peuvent remplacer l’hôte, les adaptateurs ni le budget de la mission. Les workflows de variants conservent aussi leur hôte, vérificateur et signal.

Les hôtes persistants sont recherchés dans leur périmètre projet et workspace. Une mission terminée met un hôte persistant en quiescence ; une session de mission est fermée. Une session fermée refuse toute nouvelle exécution. Les six signaux de dysbiose peuvent être dérivés du registre persistant. Seules les sanctions bornées WARN, THROTTLE, REDUCE_RESOURCES et QUARANTINE sont appliquées automatiquement ; les autres décisions demandent une approbation dans la gouvernance existante.

## Conséquences

Les anciens adaptateurs qui renvoyaient uniquement un statut ou des références déclaratives doivent fournir un résultat concret, une consommation mesurée et un vérificateur indépendant. Aucun vérificateur de secours ne simule un succès. La suite dédiée rassemble les tests Holobionte et les intégrations Biocénose/Morphogenesis. L’exemple arithmétique s’exécute sur SQLite en mémoire avec un calcul indépendant de contrôle.

La vérification protège les frontières du runtime ; la confiance dans l’implémentation et les artefacts du vérificateur appartient à l’intégrateur. L’adaptateur réalise l’isolation physique et les mesures : le runtime ne transforme pas un callback en sandbox système. Les signaux de santé restent des heuristiques, et aucune campagne longitudinale réelle n’est attestée par ces tests.

## Alternatives

- Garder le statut ACTIVE déclaratif : rejeté, car il confond composition et exécution.
- Accepter l’auto-validation du symbiote : rejeté, car transport et affirmation ne prouvent pas la décision.
- Dupliquer la provision dans Morphogenesis : rejeté pour éviter des politiques d’admission et de clôture divergentes.
- Appliquer automatiquement toute action de santé : rejeté, car les remplacements et expulsions dépassent une sanction bornée.
