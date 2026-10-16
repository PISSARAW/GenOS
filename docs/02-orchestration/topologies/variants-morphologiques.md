# Catalogue des variants morphologiques

- **Statut** : Partiel
- **Portée** : inventaire central des variants Morphogenèse provenant des registres locaux
- **Dernière revue** : 2026-10-16 (cas d'usage des huit topologies)

Le registre Morphogenèse expose un catalogue commun de variants, tout en conservant les
registres locaux comme sources de vérité pour leurs modes d'utilisation. Chaque variant est
un parcours distinct de sa topologie et a la même valeur que les autres; la maturité mesure
la couverture de son implémentation, pas son intérêt et ne sert pas à le déclasser au
routage. Le catalogue permet l'inspection et la résolution par couple topologie/variant,
mais n'unifie pas les exécutions locales.

## Guide de choix par cas d'usage

Les fiches ci-dessous couvrent les **95 variants canoniques** des huit topologies.
Chaque fiche distingue les missions auxquelles un variant répond, les signaux qui
le départagent de ses voisins et les préconditions ou limites à vérifier. Les cas
d'usage sont des critères de conception déduits des mécanismes documentés : ils ne
constituent ni une mesure comparative de qualité, ni une nouvelle règle exécutée
automatiquement par le routeur.

| Topologie | Question discriminante | Matrice des cas d'usage |
| --- | --- | --- |
| Trinity | Quels mondes, hypothèses ou objectifs comparer indépendamment ? | [Trinity](trinity.md) |
| A-Team | Quelle structure de dépendances et d'autorité organise le travail ? | [A-Team](a-team.md) |
| Biome | Comment répartir populations, niches et ressources dans le temps ? | [Biome](biome.md) |
| Biocénose | Comment former et vérifier un jugement collectif ? | [Biocénose](biocenose.md) |
| Holobionte | Quelles capacités l'hôte doit-il intégrer sous contrat ? | [Holobionte](holobionte.md) |
| Syncytium | Quel état doit être partagé et quels invariants gouvernent sa fusion ? | [Syncytium](syncytium.md) |
| Rhizome | Comment les capacités communiquent-elles et le réseau évolue-t-il ? | [Rhizome](rhizome.md) |
| Métapopulation | Comment maintenir plusieurs dèmes, leurs migrations et leur diversité ? | [Métapopulation](metapopulation.md) |

Pour décider, relever d'abord l'objectif, les dépendances, la forme des preuves,
les contraintes d'autorité et de confidentialité, la durée et le budget de la
mission. Écarter ensuite les variants dont les préconditions ne sont pas
satisfaites. Comparer les variants encore compatibles sur le besoin dominant et
le coût de coordination ou de transition. Un signal textuel isolé ne prouve pas
qu'un variant est le meilleur ; un choix incertain doit rester traçable et peut
conserver la forme courante. Les routeurs locaux effectuent leurs sélections
par signaux et contrats. Morphogenèse dispose aussi d'une
[présélection par cas d'usage](../../adr/0563-selection-des-variants-par-cas-d-usage.md)
qui compare les 95 profils et inscrit signaux et alternatives dans son reçu.
Ce classement reste heuristique et ne lui ajoute pas de calibration empirique.
Le chemin standard peut maintenant charger des [issues appariées vérifiées](../../adr/0564-charger-les-issues-verifiees-dans-la-continuation.md)
pour calibrer la décision de transition exacte. Ce chargement ne calibre pas
automatiquement la présélection textuelle : sans corpus admissible pour le
`candidateId` considéré, la politique conserve `NO_CHANGE`.
Le profil structuré et les poids de priorité explicitement fournis par la
mission atteignent désormais le classement. Les huit formes `default` ont un
signal documentaire propre ; lui non plus ne constitue pas une preuve de gain.
Si une proposition calibrée est retenue, le plan préparé doit porter exactement
la même topologie et le même variant avant l'admission.

## Couverture actuelle

| Topologie | Variants spécifiques au registre central | Source projetée | Maturité déclarée |
| --- | ---: | --- | --- |
| A-Team | 11 | `aTeam/variants/variantRegistry` | Politiques et évaluateurs isolés implémentés ; conformité d’exécution globale partielle, sous-runs multiteam génériques non branchés ([contrat](../../03-reference/runtime-a-team.md)) |
| Biocénose | 12 | `biocenose/variants/variantPolicyRouter` | Implémentés ou partiels selon la politique |
| Holobionte | 12 | `holobionte/variants` | Douze politiques sélectionnables ; couverture contractuelle, placement physique et bénéfice comparatif à distinguer |
| Syncytium | 13 | `syncytium/variants/variantPolicyRegistry` | Implémentés |
| Rhizome | 12 | `rhizome/variants/variantPolicyService` | Implémentés |
| Métapopulation | 16 (12 documentés + 4 alias historiques) | `metapopulation/policy/metapopulationPolicyService` | Effets régionaux et reprise couverts ; maturité centrale conservée, moteurs externes à qualifier |
| Biome | 11 | `biome/variants/variantPolicyService` | Partiels; sélection et politiques reliées au runtime |
| Trinity | 12 | `trinityVariantService` | Implémentés ou partiels selon la variante |

Les nombres du tableau comptent les variants nommés spécifiques et excluent `default`,
enregistré séparément pour les huit topologies. Un variant catalogué n'implique pas que
toutes ses garanties ou tous ses mécanismes disposent d'un adaptateur complet. Cette limite
de couverture n'en fait pas un variant de valeur inférieure et ne doit pas, seule, empêcher
son choix lorsque les signaux de mission lui correspondent.

Le [contrat des snapshots topologiques](../../03-reference/snapshots-topologiques.md)
référence les preuves de capture propres à chaque variant. Cette couverture
concerne les routes Lineage de snapshot d'agent et leur prévalidation de
reprise ; elle ne certifie pas l'exécution métier des variants. Les règles
de l'alias `default` diffèrent entre adaptateurs, notamment pour Trinity,
Métapopulation et Syncytium.

Le [contrat runtime Syncytium](../../03-reference/runtime-syncytium.md), revu au
2026-10-06, distingue le dispatch biologique, qui active les services spécialisés
par défaut, et l'appel Node direct au registre, qui exige `useVariantRuntime: true`.
Les préconditions de chaque variant restent nécessaires ; leur sélection seule
ne prouve pas l'exécution de leurs opérations métier.

Le variant `realtimeControl` possède une qualification dédiée dans
`backend/tests/test_syncytium_realtime_control_variant.js` : le watchdog persiste
son journal, le journal fail-safe et la sortie sûre dans une transaction, et le
planificateur EDF identifie un échéancier non faisable. Cette preuve ne certifie
ni temps réel dur, ni borne WCET universelle, ni contrôleur matériel.

## Contrat et résolution

Chaque entrée centrale expose :

- `topology` et `variantId`, qui identifient sans ambiguïté le couple morphologique ;
- `parameters`, projetés du registre local ;
- `requiredCapabilities`, lorsque la source locale les déclare ;
- `maturity` (`implemented`, `partial` ou `conceptual`) et `source`, pour rendre visibles
  le niveau de réalité et la provenance.

Le registre est accessible via `createTopologyRegistry()`. `registry.variants.list(topology)`
renvoie les identifiants connus, et `registry.variants.resolve(topology, variantId)` renvoie
une copie défensive de l'entrée. Un variant inconnu renvoie `null`.

## Limites actuelles

- La planification Morphogenèse compare les topologies; les routeurs locaux choisissent le
  variant de mission selon leurs propres signaux et contraintes. Le catalogue central
  n'exécute pas lui-même ces modes et ne normalise pas encore tous leurs reçus.
- Les paramètres spécifiques restent interprétés par le runtime local correspondant.
- Holobionte expose désormais des contrats de placement, mémoire, compétition, outils et
  synchronisation pour les variants correspondants. Ce sont des exigences déclaratives de
  composition; elles ne prouvent pas à elles seules le placement distribué, l'exécution d'outils,
  la réplication, ni les mécanismes complets de fitness, d'acquisition ou de régénération.
- Le runtime Holobionte fournit des plans vérifiables pour dépendances keystone et rollback,
  fitness longitudinale et dysbiose, placement soumis aux disponibilités/leases/confidentialité,
  consolidation mémoire avec provenance/conflits, essais compétitifs à budget égal, recrutement
  contractuel de capacités manquantes, validation de manifestes d'outils, réconciliation causale
  d'événements edge et régénération soumise à preuves. Il refuse l'assimilation automatique,
  l'écrasement de conflits et le remplacement sans preuve. Ces fonctions préparent et contrôlent
  les actions; elles ne fournissent pas elles-mêmes les moteurs cloud/edge, le chiffrement de
  transport, les magasins mémoire spécialisés ni les exécuteurs de procédures/outils. Les gates
  attendent un vérificateur indépendant injecté pour les snapshots et approvals, leases, essais
  comparatifs, provenance, santé d'outil, fallback local et tests de restauration; un booléen fourni par le candidat ne
  suffit pas. L'évaluation immunitaire utilise les menaces déclarées, la mémoire adaptative et
  peut inclure la calibration des faux positifs et la détection d'auto-immunité.
- Les variants Biocénose marqués `PARTIAL` gardent une maturité partielle. Pour
  Holobionte, le niveau projeté décrit la couverture de la surface contractuelle,
  des gates et des opérations ; il ne démontre ni placement distribué réel ni
  gain mesuré. La maturité n'instaure aucune hiérarchie de valeur entre variants.
- Trinity déclare les douze presets et politiques exécutables, dont Factorial, Recursive et
  Oracular. Le choix automatique est signalé par la mission; le reçu expose les adaptateurs
  requis et leurs contrats, et refuse un adaptateur non chargeable ou indisponible. Les
  modules spécialisés existent, mais ce contrat ne prouve pas que chaque adaptateur est
  invoqué et vérifié dans le cycle complet d'une mission; cette intégration reste à valider.
- Métapopulation garde quatre noms historiques (`balanced`, `resilient`, `exploratory`,
  `conservative`) en plus des douze identifiants de sa fiche. Le contrôleur applique
  les politiques avec reçus et relecture des effets : réserve de fondateurs,
  résidents, états d'îlot, transferts fédérés/culturels et reprise rescue.
  Les évaluateurs locaux, le solveur et le moteur Rust restent des adaptateurs
  explicites. Les références de cryptobiose ne prouvent pas une restauration
  externe automatique. Voir le [contrat runtime](../../03-reference/runtime-metapopulation.md).
- Le catalogue ne normalise pas encore pour tous les variants le profil de problème, les
  modèles d'autorité, d'état, de communication et de preuve, ni les forces et modes d'échec.

## Ajouter ou modifier un variant

1. Modifier le registre local qui porte la politique du variant.
2. Mettre à jour le projecteur correspondant dans `backend/src/services/morphogenesis/registry/variantCatalog.js`.
3. Ajouter un test du couple topologie/variant, des capacités et de la maturité projetées.
4. Ne brancher une sélection automatique qu'après définition de ses critères de compatibilité
   et de son adaptateur d'exécution.

Voir [ADR 0110](../../adr/0110-catalogue-central-des-variants-morphologiques.md) pour la décision
de centralisation et [Morphogenèse](morphogenese.md) pour le cadre général.
