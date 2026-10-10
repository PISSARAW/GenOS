# Obstacle 4 — Communication et consolidation scientifique, revue du 10 octobre 2026

- **Statut** : audit du dépôt et cible d'architecture ; tranche locale implémentée, flux autonome non qualifié.
- **Portée** : Signal Plane, politique de communication, Garage Fabric, GQWF v2, preuves et G-CIR Ω.
- **Dernière revue** : 2026-10-10.

## Diagnostic actualisé

L'analyse antérieure avait raison de séparer communication entre agents et
construction du contexte d'un modèle. Elle sous-estimait toutefois le travail
nécessaire pour qu'une référence transportée devienne une connaissance utilisable.
Le dépôt dispose maintenant de [Garage Fabric](../02-orchestration/topologies/garage-fabric.md)
avec domaines et plafonds durables, et de [GQWF v2](../02-orchestration/gqwf-v2.md)
avec racines de fichiers, vues privées, baux et raccordement explicite de certains
workers autonomes. Cela change le point de départ : l'isolation et la capacité
physique ont des contrats exécutables, mais une racine de fichiers ne certifie
pas une proposition scientifique et ne garantit pas sa visibilité à un agent.

La version optimale est un **graphe de résultats scientifiques versionnés**.
Chaque résultat possède un énoncé exact, des hypothèses, un domaine de validité,
des dépendances, un contenu adressé par hash et un reçu de vérification
indépendant. La politique existante choisit les consommateurs pertinents ; le
Signal Plane livre une notification compacte ; G-CIR ne matérialise que le
contexte nécessaire à une obligation ouverte. L'[ADR 0377](../adr/0377-consolidation-scientifique-par-references-versionnees.md)
décrit la décision proposée et sa première tranche exécutable. Son statut
« proposé » reste intentionnel tant que le flux autonome n'est pas qualifié.

## Ce qui existe et ce qui manque

| Sujet | État observé | Écart bloquant |
| --- | --- | --- |
| Admission et workspaces | Garage Fabric a des domaines, files et quotas ; GQWF v2 conserve racines, overlays et baux. | La racine n'inclut pas tout l'environnement d'exécution, Git ou l'état d'un organisme ; le raccordement worker reste partiel. |
| Choix des destinataires | `CommunicationPolicyEngine` permet silence et ciblage ; un index SQLite relie maintenant dépendances, versions et obligations par agent. | L'audience experte et l'abonnement avant publication ne sont pas raccordés ; une vue de garage n'atteste toujours pas la visibilité individuelle. |
| Transport | Le subscriber sonde l'outbox scientifique ; son relais inscrit une enveloppe ciblée et sa livraison durable dans une transaction, puis vérifie l'enveloppe avant acquittement de l'outbox. Les rétractations sont prioritaires et les échecs sont repris avec délai. | La livraison n'atteste pas la compréhension ; les effets des récepteurs restent non atomiques avec l'acquittement et aucun producteur scientifique autonome n'est raccordé. |
| Preuve | Le store scientifique lie reçu Lean, identité/version, source, environnement, dépendances et octets ; le resolver échoue fermé. | L'autorité de reçus reste à reconstituer au redémarrage ; le lien sémantique texte naturel–Lean n'est pas démontré. |
| Contre-exemples | La rétractation scientifique locale exige un reçu indépendant, rend les dérivés obsolètes et inscrit l'outbox dans la même transaction. | Le pont depuis le propagateur historique en mémoire et la reprise interprocessus restent à raccorder. |
| Contexte modèle | Le READ G-CIR Node résout l'URI scientifique, inscrit les octets visibles et invalide la version dans toutes les sessions concernées. | Pas de resolver scientifique Rust ni de preuve de capacité à 10 000 identités. |

Les correctifs de cette revue ferment quatre risques locaux : suppression de
capsule soumise à l'epoch et à l'arrêt du processus, liaison de l'énoncé dans le
gate Lean, non-confusion des événements scientifiques au coalescing, et sélection
de l'audience demandée avant la limite SQL. La tranche suivante ajoute le
registre versionné, la transaction de publication/rétractation, l'outbox et le
READ G-CIR, vérifiés dans des tests SQLite en mémoire. Ces résultats ne
constituent pas une preuve du flux autonome ni d'une capacité de 10 000 workers.

## Flux cible minimal

1. Un worker produit une proposition et ses artefacts dans sa vue privée. Le
   vérificateur indépendant lie son reçu à l'énoncé formel, aux hypothèses, aux
   dépendances et à l'environnement. Un hash de contenu seul reste insuffisant.
2. Une transaction locale inscrit l'objet immuable, son index inverse de
   dépendances et un événement d'outbox. La publication ne promeut que la
   version effectivement vérifiée.
3. L'audience est déterminée d'abord par les obligations ouvertes. Les experts
   supplémentaires sont recherchés selon le coût et l'indépendance. Le silence
   demeure une issue valide.
4. Le Signal Plane transporte type, identifiant, version, portée et reçu. Un
   consommateur résout le contenu sous contrôle d'accès ; l'accusé de livraison
   ne devient pas un accusé de compréhension ou de preuve.
5. G-CIR charge uniquement les références autorisées nécessaires à l'obligation
   non résolue, enregistre les versions réellement visibles et évite l'inférence
   si une opération déterministe suffit.
6. Une rétractation validée suit l'index inverse, invalide les résultats dérivés
   et les vues cognitives concernées, puis réveille seulement les consommateurs
   bloqués sur cette dépendance.

La reprise d'outbox et les effets récepteurs idempotents sont indispensables :
la transaction actuelle du blob et de ses livraisons évite une persistance
partielle, mais ne peut pas annuler un effet récepteur déjà exécuté. Un
contre-exemple accepté en mémoire ne suffit pas à déclencher une rétractation
durable dans tout le système.

## Mesure avant toute revendication d'échelle

Comparer les configurations actuelles et cible avec 100, 1 000 et 10 000
**identités logiques**, en fixant séparément le nombre de capsules physiques et
les inférences simultanées. Mesurer le coût complet, y compris import GQWF,
capture, matérialisation, stockage, livraison, vérification et reprise. Suivre
les résultats vérifiés par unité de coût, les messages par résultat utile, les
inférences évitées, la latence de disponibilité, les doublons et les résultats
obsolètes consommés. Injecter des pannes entre commit, livraison, effet
récepteur et acquittement, ainsi que des rétractations concurrentes.

**Critère de promotion** : aucune preuve ou connaissance dérivée n'est rendue
`verified` sans reçu lié à l'énoncé et à sa version ; après reprise, chaque
consommateur concerné voit la publication ou l'invalidation au plus une fois
logiquement. La tenue à 10 000 agents reste une hypothèse tant que ce protocole
et son benchmark ne sont pas exécutés.
