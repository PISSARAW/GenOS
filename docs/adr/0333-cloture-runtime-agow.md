# ADR 0333 — Clôture des contrats runtime AGOW

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : AGOW, branchements hôte, budgets, persistance, preuve

## Contexte

Les mécanismes AGOW existaient, mais plusieurs contrats n'étaient pas fermés :
defaults remplaçant les extensions, cibles perdues lors du routage direct,
décompilation utilisant une variable inexistante, délai de requête non appliqué,
outcome nul assimilé à une perte nulle et absence de branchement durable de
propositions pour deux modes. Les essais locaux ne couvraient pas la reprise
des reçus entre processus.

## Décision

1. Associer les callbacks hôte au couple connexion SQLite / agent et conserver
   les extensions pendant l'installation des defaults.
2. Sélectionner les modes réellement disponibles. Fournir des defaults pour
   proposer une consolidation ou une réorganisation, sans promotion implicite.
3. Réserver les coûts avant appel, appliquer l'échéance et transmettre un signal
   d'annulation. L'hôte reste responsable du sandbox des effets externes.
4. Suspendre et décompiler une voie directe en échec ; réutiliser les limites
   restantes pour la récupération.
5. Mettre à jour atomiquement les reçus de modes, reçus de requêtes et cooldowns.
   Exiger une perte numérique réellement fournie et refuser les observations
   contradictoires d'un même reçu.
6. Exécuter un banc reproductible avec modèles MBH/Lipson simplifiés, noyaux
   prédictifs/Self-Twin du dépôt, ablation, médiation et trois corpus disjoints.
   Sceller le protocole et les manifestes avant de lire les outcomes.

## Conséquences

Les modes disposent de routes explicites et observables. Les erreurs de
branchement, de budget et de retour ne deviennent pas des succès. La reprise
des reçus est vérifiée sur SQLite disque et entre processus.

Les callbacks doivent être réenregistrés après redémarrage. Un timer ne tue
pas un callback JavaScript et un coût déclaré n'est pas une mesure indépendante
de la dépense réelle. Les prototypes biomimétiques restent des modèles logiciels.
Les résultats synthétiques sont descriptifs et peuvent être défavorables aux
variantes GenOS ; aucune promotion causale automatique n'en découle.

## Alternatives

- Forcer tous les modes sans exécuteur : rejeté, car cela annonce une capacité
  indisponible.
- Utiliser uniquement des handlers globaux : rejeté pour les adaptateurs propres
  à une mission ou un agent ; maintenu pour les defaults de processus.
- Considérer la présence d'un protocole comme une campagne exécutée : rejeté.
- Remplacer les gates d'activation par les résultats du banc local : rejeté,
  car celui-ci n'établit pas la validité métier ou scientifique externe.

## Références

- [Contrat runtime AGOW](../03-reference/runtime-agow.md)
- [AGOW](../02-orchestration/agow.md)
- [Campagne de clôture](../06-qualite-preuves/campagne-agow-cloture.md)
