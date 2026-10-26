# ADR 0747 — Contrats d’assemblage des prompts et du cycle de communication

- **Statut** : Proposé pour implémentation
- **Date** : 2026-10-26
- **Domaine** : Runtime, prompts, communication inter-agents, budgets et preuves
- **Décideurs** : GenOS maintainers
- **Lié à** : [ADR 003x](003x-communication-ecology.md), [ADR 0383a](0383-economie-tokens-conditionnee-aux-preuves.md), [ADR 0487](0487-recus-communication-inter-agents.md), [ADR 0522a](0522-bootstrap-mcp-coordination-workers.md), [ADR 0734](0734-contrat-de-decision-de-communication-composee.md), [ADR 0738](0738-boucle-developpement-social-integree.md)

## Contexte

GenOS possède plusieurs constructeurs de prompt et runtimes d’exécution, ainsi
que plusieurs chemins de communication. Les obligations de preuve, les budgets,
les instructions de coordination et les reçus sont répartis entre ces chemins.
Un prompt compact dans un runtime ne garantit donc pas que les autres runtimes
évitent les blocs inutiles. De même, une décision d’encodage ne prouve pas que
le transport a envoyé cet encodage.

Les parcours `runCycle`, checkpoints et boucle sociale appliquent aujourd’hui
des parties distinctes de la décision, des contraintes, du transport et des
métriques. Les contrats existants distinguent déjà transport, grounding et
résultat vérifié; le nouveau contrat doit préserver ces distinctions. Une
estimation de tokens n’est pas une mesure fournisseur et un accusé de livraison
n’est pas une preuve d’utilité métier.

## Décision

Définir deux contrats versionnés distincts, reliés par un identifiant de trace.
Ils ne partagent pas de texte ni d’autorité : l’un assemble le contexte présenté
au modèle, l’autre exécute une intention de communication entre agents.

### `genos.runtime-prompt/v1`

Le contrat d’assemblage représente le prompt comme des sections typées avant
son rendu. Il contient au minimum la tâche, le rôle et ses limites d’autorité,
le format de sortie et les preuves requises, le workflow actif, les capacités
effectivement disponibles, le budget, ainsi que les sections de contexte
optionnelles avec leur provenance et priorité.

Les sections requises comprennent la tâche intacte, le rôle, les contraintes
actives non imposées par le runtime, le format de sortie et les exigences de
preuve. Les phases ordonnées et outils requis ne sont inclus que si le plan
actif les déclare. Mémoire, conscience, conseils et identité narrative sont
facultatifs, classés par priorité et bornés. Les instructions déjà imposées par
les leases, le sandbox, les schémas ou le contrôle d’exécution ne sont pas
répétées sans nécessité cognitive.

Un normaliseur commun choisit et déduplique les sections; chaque runtime les
rend dans son format propre. Le rendu ne change ni l’autorité, ni les gates, ni
les exigences de preuve. Les capacités présentées au modèle sont informatives :
le runtime reste l’unique autorité sur les permissions et valide chaque action.
Les modes de topologie et de coordination proviennent de champs validés, jamais
d’une déduction par mots-clés dans le texte de la mission.

Le budget est vérifié sur la requête complète rendue par le runtime, y compris
les blocs fixes et les éléments ajoutés après préflight. Les estimations
pré-appel restent étiquetées comme estimations; les reçus fournisseur font foi
pour les tokens consommés. La compaction peut retirer ou réduire des sections
facultatives selon leur priorité. Elle ne tronque pas silencieusement la tâche,
les sources de preuve ni les contraintes requises. Si le noyau obligatoire
dépasse le budget, l’appel est refusé avec un diagnostic explicite.

### `genos.communication-cycle/v1`

Le cycle de communication reçoit une intention normalisée, son scope, son
contexte de décision, ses options de politique validées, son mode d’exécution,
son échéance et les capacités applicables. Il porte un identifiant de cycle
stable pour la corrélation et l’idempotence.

Un coordinateur commun applique les étapes dans cet ordre : validation et
résolution du contexte; décision brute; contraintes de topology, manifeste et
budget; encodage; transport compatible; reçus et mesures; apprentissage
éventuellement autorisé. `decideCommunication` reste la source de vérité de la
décision brute. Les gates spécifiques aux checkpoints restent obligatoires et
s’exécutent avant tout transport.

Le plan exécutable contient la décision finale, les destinataires, les groupes
de variantes, l’encodage et sa version, les conditions de repli, les contraintes
appliquées, le grounding requis et l’échéance. L’encodeur produit la charge
réellement transmise; l’enveloppe lie cette charge à l’encodage déclaré et aux
destinataires. Si un destinataire ne peut pas décoder une variante, le cycle
utilise explicitement le format canonique ou refuse l’envoi. Un transport ne
peut pas changer l’encodage ni les destinataires du plan.

Les reçus distinguent publication, livraison, lecture, accusé sémantique,
action observée et vérification indépendante. Aucune étape ne promeut
implicitement le niveau de preuve. Simulation et mode shadow ne produisent pas
de preuve réelle ni d’apprentissage. Les métriques et l’apprentissage ne sont
alimentés qu’une fois par cycle, à partir des observations et preuves du niveau
requis.

### Adaptateurs et compatibilité

`runCycle` et `evaluateCheckpoint` deviennent des façades compatibles du
coordinateur commun et conservent leurs formes de réponse pendant la migration.
Les bridges de mission et la boucle sociale gardent leurs interfaces publiques,
mais confient l’exécution au même cycle. Les identifiants, clés d’idempotence,
gates, modes shadow et reçus existants restent compatibles. Les anciens reçus
sans métadonnées d’encodage restent lisibles comme non qualifiés pour prouver
une économie d’encodage.

Le contrat d’assemblage n’accorde aucun outil et ne remplace pas les politiques
d’accès. Le cycle de communication ne réinjecte pas l’historique de conversation
complet dans les messages. Un identifiant de trace relie les appels modèle, les
cycles de communication et les reçus sans mélanger leurs contenus.

## Conséquences

### Positives

- Les runtimes peuvent partager les mêmes obligations tout en conservant des
  renderers et adaptateurs spécifiques à leurs capacités.
- La sélection d’un encodage devient vérifiable sur le payload réellement
  livré, avec un repli canonique explicite.
- Les checkpoints, `runCycle` et la boucle sociale partagent le même ordre de
  gates, d’exécution et de mesure.
- Les tokens estimés restent distincts des usages mesurés; livraison et succès
  métier restent des niveaux de preuve distincts.

### Négatives et limites

- Le contrat de prompt et le cycle de communication demandent une migration
  incrémentale des chemins Codex, local, Solar, caller-MCP, checkpoints et social.
- Les encodages sans transport compatible restent indisponibles jusqu’à
  l’enregistrement d’un adaptateur testé; ils ne sont pas simulés comme actifs.
- Une économie de tokens ne peut pas être conclue sans reçus fournisseur
  complets et campagne appariée sur des missions entières.
- Une persistance durable de chaque assemblage ou cycle pourrait nécessiter une
  migration de schéma; elle n’est pas requise par ce contrat seul.

## Migration

1. Ajouter les DTO versionnés, leurs validateurs et un identifiant de trace,
   sans changer les formes publiques existantes.
2. Adapter les constructeurs actuels vers `genos.runtime-prompt/v1`; comparer
   les sections requises et le budget pour les profils orchestrateur, worker,
   coordination continue, worker isolé et caller-MCP.
3. Ajouter le coordinateur commun du cycle sans modifier initialement les
   décisions; faire de `runCycle` une première façade.
4. Migrer les checkpoints puis la boucle sociale en conservant leurs gates,
   reçus et clés d’idempotence.
5. Activer les encodages uniquement lorsqu’un transport correspondant est
   configuré; raccorder les métriques et l’apprentissage aux reçus qualifiés.
6. Retirer les chemins redondants après vérification de la compatibilité et de
   la parité Node/Rust.

Aucune migration SQLite n’est requise tant que les nouveaux champs restent
additifs aux reçus existants ou dans les traces d’exécution. Si une persistance
durable des plans, des hashes de prompt ou des reçus de cycle est choisie, elle
fera l’objet d’une décision de schéma séparée. Le texte brut des prompts n’est
pas persisté par défaut; les hashes, identifiants de sections et compteurs
suffisent à la qualification initiale.

## Validation attendue

- Les prompts finaux par runtime contiennent une seule fois la tâche, les
  affectations et la mémoire; les blocs conditionnels suivent le plan validé.
- Les permissions, gates et preuves obligatoires restent contrôlés par le
  runtime; le bootstrap seul ne valide pas la mission.
- Le budget couvre la requête complète rendue; aucun dépassement du noyau
  obligatoire n’est masqué par une troncature.
- Les chemins `runCycle` et checkpoint passent par le même coordinateur; les
  gates précèdent le transport et les métriques ne sont écrites qu’une fois.
- Le payload reçu correspond à l’encodage annoncé, les destinataires et reçus
  sont corrélés, et les échecs de transport restent explicites.
- Les tests de contrat comparent les schémas MCP Node/Rust. Les économies ne
  sont qualifiées qu’après une campagne appariée utilisant les reçus
  fournisseur complets et un vérificateur indépendant.

## Alternatives

- **Un seul contrat mêlant prompt et message inter-agents** : rejeté, car les
  destinataires, budgets, autorités et preuves n’ont pas la même portée que le
  contexte présenté à un modèle.
- **Maintenir les constructeurs et cycles séparés puis comparer leurs sorties** :
  rejeté, car la déduplication, les gates et les mesures resteraient propres à
  chaque parcours et pourraient diverger.
- **Remplacer tous les prompts par une chaîne minimale générée** : rejeté, car
  cela peut supprimer des contraintes cognitives qui ne sont pas imposées par
  le runtime.
- **Considérer le transport réussi comme preuve de succès** : rejeté,
  conformément aux gates d’évidence existants.
