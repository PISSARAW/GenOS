# ADR 0648 — Qualifier les adaptateurs comme symbiotes sélectionnables

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : intégrations, Rhizome, Holobionte, Garage Fabric, Métapopulation
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0046, ADR 0047, ADR 0052, ADR 0054, ADR 0616

## Contexte

Une intégration externe était décrite dans plusieurs contrats spécialisés sans
identité écologique commune. Le routage Rhizome savait représenter capacités,
coût, latence et fiabilité ; Holobionte savait borner les permissions d'un
symbionte ; Garage Fabric savait réserver un worker sous bail ; Métapopulation
savait mettre en quarantaine puis assimiler un propagule. Aucun contrat ne
permettait toutefois de comparer un petit ensemble d'intégrations, d'écarter un
adaptateur malade et de propager un changement entre dépôts par vagues.

## Décision

1. Une intégration candidate est qualifiée par un manifeste
   `genos.adapter-symbiont/v1`. Il lie identité, version, capacités, scopes de
   données, tool leases, coût, latence, santé, fitness, références d'attestation
   et fonction de compensation. Les wildcards d'autorité et l'absence de preuve
   sont refusées.
2. Le manifeste produit des projections vers `CapabilityNode` Rhizome et
   `SymbiosisContract` Holobionte. Ces projections réemploient les validateurs
   canoniques ; elles ne créent pas une nouvelle autorité d'exécution.
3. La sélection cherche le sous-ensemble admissible de cardinalité minimale.
   Le coût, la latence, la fitness puis l'identité déterministe départagent les
   sous-ensembles de même taille. La recherche est bornée à seize candidats.
4. Une observation de santé manquante, périmée ou dépourvue de preuve provoque
   une dysbiose. Le symbionte est exclu de la recomposition et sa compensation
   reste bloquée jusqu'à la présence de toutes les preuves déclarées.
5. Un changement multi-dépôts est modélisé comme une migration de propagules :
   un dépôt pilote, puis des vagues topologiques. Chaque vague attend les preuves
   de tous ses dépôts. Un rejet produit un plan de rollback des dépôts déjà
   appliqués ; il ne prétend pas que le rollback a été exécuté.

## Conséquences

### Positives

- la même identité qualifiée alimente Rhizome, Holobionte et Garage Fabric ;
- le choix minimal est reproductible et expliqué par un reçu consultatif ;
- une intégration dégradée peut être remplacée sans élargir les permissions ;
- une migration multi-dépôts s'arrête à la première preuve absente ou négative ;
- les compensations restent explicites et séparées de leur exécution.

### Négatives

- la sélection exhaustive impose une limite de seize candidats ;
- les coûts et latences agrégés sont des estimations déclarées, pas une mesure
  de production certifiée ;
- la boucle ne persiste pas encore de registre longitudinal d'adaptateurs ;
- les requêtes Garage produites sont consultatives et ne réservent aucun worker.

## Alternatives rejetées

- **Installer toutes les intégrations disponibles** : augmente l'autorité, le
  coût et le risque de dépendance sans prouver leur nécessité.
- **Classer un adaptateur à la fois** : ne résout pas la couverture composée de
  plusieurs capacités.
- **Continuer une vague avec une preuve partielle** : confond transport réussi et
  décision valide.
- **Exécuter automatiquement la compensation** : le manifeste décrit une action,
  mais ne constitue ni lease courant ni preuve d'autorisation.

## Vérifications associées

- `node backend/tests/test_adapter_symbiont_manifest.js` ;
- `node backend/tests/test_adapter_minimal_consortium.js` ;
- `node backend/tests/test_adapter_consortium_succession.js` ;
- `node backend/tests/test_adapter_multi_repository_migration.js` ;
- `python scripts/ci/check_code_quality.py`.
