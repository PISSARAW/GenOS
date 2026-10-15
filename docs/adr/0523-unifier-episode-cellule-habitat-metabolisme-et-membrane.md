# ADR 0523 — Unifier épisode, cellule, habitat, métabolisme et membrane

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : orchestration, workers, sécurité et observabilité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0200 — Lier la morphogenèse au dispatch de mission

## Contexte

Le runtime possède déjà des missions, agents, runs, traces, leases, approbations,
budgets et capsules. Ces objets ne partagent pas encore partout une colonne
vertébrale relationnelle unique. Certaines corrélations restent portées par des
payloads JSON et les mesures de consommation ne distinguent pas toujours une
valeur nulle attestée d'une mesure indisponible.

Le runner local borne des commandes, l'environnement et la sortie, mais ne
fournit pas à lui seul les frontières noyau d'un conteneur ou d'une microVM. Le
runtime doit donc enregistrer les garanties réellement appliquées sans déduire
l'isolation du nom d'une API ou d'une capsule.

## Décision

GenOS introduit quatre contrats persistants complémentaires.

1. Un **épisode de mission** identifie l'exécution supervisée et porte les
   références immuables nécessaires à sa reconstruction. Ses **threads
   cellulaires** représentent le contexte d'un orchestrateur ou d'un worker,
   leur filiation et leurs transitions d'état.
2. Une **révision d'habitat** décrit le substrat inerte réellement alloué : type
   de runtime, image, filesystem, réseau, limites, courtier de secrets,
   ressources montées et niveau d'assurance de chaque frontière. Une mission est
   liée à une révision exacte par un enregistrement immuable.
3. Un **ledger métabolique** conserve les mesures de tokens, cache, coût, temps
   et outils avec leur source : exacte, reçue du provider, estimée ou
   indisponible. Une absence de mesure n'est jamais encodée comme zéro.
4. Une **membrane de permission** résout chaque appel d'outil vers `deny`,
   `allow`, `ask` ou `evaluate`, puis conserve un reçu lié au hash des arguments,
   à l'identité du worker, au lease, à la politique et au résultat.

Ces contrats complètent les tables existantes. Leur première version peut être
consommée progressivement par les chemins de mission ; leur seule présence ne
prouve ni que chaque ancien run a été migré, ni qu'une frontière d'isolation est
appliquée par le système d'exploitation.

Les configurations et liaisons sont immuables. Les évolutions créent une
nouvelle révision. Les lectures vérifient les hashes canoniques et le périmètre
organisation/projet. Les migrations sont idempotentes et intégrées au registre
versionné du backend.

## Conséquences

### Positives

- Une mission peut converger vers une corrélation relationnelle commune.
- Les garanties d'habitat deviennent inspectables et ne sont plus implicites.
- Les coûts nuls, inconnus et estimés deviennent distinguables.
- Les décisions d'outil disposent d'un format commun à Cedar, leases et
  approbations.
- Les concepts biologiques correspondent à des contrats persistés : épisode,
  cellule, habitat, métabolisme et membrane.

### Négatives

- Les chemins historiques restent à raccorder et peuvent produire une
  observabilité partielle pendant la transition.
- Les nouveaux contrats ajoutent des écritures et des vérifications de hash.
- Une révision d'habitat déclarant une frontière `enforced` doit être alimentée
  par le backend d'isolation ; le contrat ne crée pas cette isolation.
- La membrane n'autorise aucune action tant que les adaptateurs Cedar, lease ou
  approbation nécessaires ne produisent pas une décision admissible.

## Alternatives

- Étendre uniquement les payloads de télémétrie : rejeté, car ils ne donnent ni
  intégrité relationnelle ni reprise durable.
- Déduire l'habitat depuis le système hôte : rejeté, car la configuration et les
  garanties observées peuvent diverger.
- Réutiliser zéro pour les mesures manquantes : rejeté, car cela transforme une
  absence de preuve en mesure de non-consommation.
- Remplacer immédiatement toutes les tables de missions et de permissions :
  rejeté, car une migration incrémentale réduit le risque sur le chemin actif.

