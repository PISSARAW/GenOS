# ADR 0123 — Séparer le profil worker du contrat de méthode

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Sélection des workers, contrats de mission, topologies
- **Décideurs** : GenOS
- **Lié à** : [ADR 0043](0043-runtime-worker-phenotypes.md), [ADR 0064](0064-registre-workerkind-node-et-dispatch.md), [ADR 0121](0121-contrat-mission-comparative-et-frontieres.md), [ADR 0122](0122-evaluation-comparative-intertopologies-et-recolonisation.md)

## Contexte

La composition choisit aujourd'hui les `WorkerKind` avec plusieurs politiques
concurrentes : alias de rôle dans le registre général, tables rôle-kind propres
aux topologies, cas particuliers pour Trinity et A-Team, ainsi que détection de
méthode dans le texte pour Métapopulation. `topologyWorkerKindService` valide
ensuite l'égalité avec le kind attendu par la topologie. Cette validation prouve
la cohérence avec la table, mais pas l'adéquation entre le contrat worker et
l'algorithme ou les obligations de preuve de la mission.

Ce modèle confond trois dimensions qui évoluent indépendamment : le rôle dans
la topologie, l'autorité et les garanties d'exécution du worker, et la méthode
utilisée pour résoudre le problème métier. Par exemple, « recherche
évolutionnaire » entraîne `adaptive_worker` par heuristique, tandis que la
programmation dynamique, la recherche locale et la plupart des autres méthodes
deviennent `bounded_worker`. Les autres topologies imposent elles aussi des
kinds de rôle, sans contrat générique de capacités permettant de démontrer
qu'un kind est apte à satisfaire la mission.

## Décision

1. Définir une affectation canonique indépendante de la topologie avec trois
   champs distincts : `topologyRole` (responsabilité et périmètre), `workerKind`
   (autorité, outils et artefact de runtime) et `methodContract` (méthode,
   paramètres, stratégie permise, évaluateur et obligations de preuve).
2. Garder `WorkerKind` comme contrat de sécurité et de sortie du runtime. Ne pas
   lui faire représenter implicitement un algorithme métier. Un changement de
   méthode ne change le kind que si les capacités ou l'autorité effectivement
   requises changent.
3. Décrire les exigences d'un rôle sous forme de contraintes de capacité,
   d'autorité et d'évidence, plutôt que comme une correspondance obligatoire
   vers un kind unique. Le registre central sélectionne ou valide un kind
   explicite satisfaisant ces contraintes, quel que soit le mode : A-Team,
   Trinity, Biome, Biocénose, Holobionte, Métapopulation, Rhizome et Syncytium,
   ainsi que les autres compositions qui lancent des workers.
4. Obtenir `methodContract` d'une entrée structurée versionnée (par exemple un
   contrat comparatif, un plan d'exécution validé ou une affectation fournie par
   l'appelant). Ne pas choisir une méthode, un kind ou une stratégie à partir
   d'une expression régulière dans le prompt. Si la méthode ou ses entrées sont
   indispensables et ambiguës, refuser le dispatch avec une erreur explicite.
5. Valider séparément puis conjointement : le rôle respecte les invariants de
   topologie; le kind permet les actions, outils et artefacts demandés; et les
   capacités de méthode sont compatibles avec le kind. Persister paramètres,
   évaluateur et chemins de preuves. Le validateur d'artefact local vérifie
   actuellement la présence des chemins `requiredEvidence`; il n'exécute pas
   l'évaluateur et ne prouve pas, à lui seul, que la méthode a été suivie. Un
   transport réussi ou un kind compatible avec le rôle ne satisfait pas ces
   contrôles à lui seul.
6. Garder les politiques propres aux topologies sur leur sémantique collective
   (quorum et migration pour Métapopulation, synchronisation pour Syncytium,
   hôte et symbiontes pour Holobionte, etc.). Elles peuvent contraindre une
   affectation, mais ne redéfinissent pas le registre global des kinds.
7. Versionner et persister l'affectation complète avec l'identité worker.
   Reconstruire les autorités côté serveur. Pour les missions sans
   `methodContract` explicite, conserver un contrat `prompt_defined` : ne pas
   leur attribuer rétroactivement une preuve de conformité algorithmique.

Le résolveur commun et le contrat versionné sont appliqués aux huit topologies
(A-Team, Trinity, Biome, Biocénose, Holobionte, Métapopulation, Rhizome et
Syncytium). L'API accepte les affectations structurées `worker_assignments`;
les contrats de méthode déclarent version, identifiant, exigences de capacité,
paramètres, preuves et évaluateur. Le kind et l'affectation sont persistés et
le runtime recalcule puis vérifie l'autorité côté serveur. Les missions qui ne
fournissent pas de méthode explicite gardent `prompt_defined` : elles ne sont
pas présentées comme ayant une conformité algorithmique vérifiée.

## Conséquences

### Positives

- Une même règle de sélection et de validation s'applique à toutes les
  topologies sans réduire leur sémantique à une table rôle-kind.
- La méthode demandée possède un contrat et des obligations de preuve propres,
  indépendants des permissions du worker.
- Les erreurs distinguent une incompatibilité d'autorité, une méthode non
  supportée et un contrat de mission incomplet.
- La sélection devient auditable et reproductible à partir de données
  persistées, plutôt que d'une interprétation heuristique du prompt.
- Le validateur local vérifie les chemins métier déclarés dans
  `requiredEvidence` avant d'accepter l'artefact; l'évaluation sémantique reste
  à raccorder à l'évaluateur déclaré.

### Négatives

- Les producteurs de missions doivent fournir ou construire des contrats
  structurés; les prompts libres ne suffisent plus pour les méthodes exigeant
  une validation précise.
- Les contrats persistés nécessitent une version et une stratégie de lecture
  des missions historiques.
- Les kinds actuels peuvent ne pas exprimer toutes les capacités algorithmiques;
  le nouveau contrat de méthode doit donc rester une dimension séparée au lieu
  de créer un kind par algorithme.
- Le sélecteur contrôle la compatibilité déclarée, pas l'exécution réelle de
  l'algorithme; l'évaluateur du contrat n'est pas encore invoqué par le
  validateur d'artefact local.
- Une méthode libre sans capacité déclarée échoue fermée; le catalogue devra
  évoluer avec les méthodes réellement prises en charge.

## Alternatives

- Ajouter une entrée rôle-kind par topologie et méthode : rejeté, car cela
  multiplie les tables redondantes sans définir les obligations de preuve.
- Extraire les méthodes des prompts avec des heuristiques plus détaillées :
  rejeté, car le texte resterait une source ambiguë pour une décision de
  contrat.
- Créer un `WorkerKind` pour chaque algorithme : rejeté, car méthode métier,
  autorité runtime et forme d'artefact ont des cycles de vie différents.
- Laisser le LLM choisir le kind : rejeté, car le contrôle d'autorité et la
  validation du contrat doivent rester déterministes et côté serveur.
