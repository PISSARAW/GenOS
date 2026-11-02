# ADR — Système nerveux opérationnel GenOS

- Date : 2026-11-02
- Statut : proposé ; implémentation sur branche de travail
- Base inspectée : `ef367fdbd19ac95de75865d1e42f747eb7a19c78` (`v3`)
- Domaine : observabilité, régulation, persistance, autorité

## Contexte

GenOS possède déjà des modèles neurobiologiques Rust, notamment
`crates/genos-biology/src/neurobiology/system.rs`, et un `NeuroLab` dans
`crates/genos-orchestrator/src/neuro.rs`. Cette couche ne les remplace pas.
Elle ajoute au backend actif une observation opérationnelle de la télémétrie
persistée, des états par agent et des propositions de réflexes auditables.
Elle ne prétend pas démontrer la conscience, une simulation neurologique ou
un diagnostic causal automatique.

ELK inspire la séparation collecte/normalisation/exploitation. Le pont OTLP
existant reste indépendant. Aucun serveur Elastic, appel LLM ou nouveau
package npm n'est nécessaire.

## Décision

1. `telemetryPersist` programme un effet secondaire facultatif après la
   persistance primaire. Le pont relit la ligne canonique par identifiant ET
   scope, puis conserve uniquement les attributs autorisés. Les détails,
   prompts et sorties d'outils ne sont pas copiés. Aucun endpoint HTTP/MCP ajouté.
2. Une connexion SQLite dédiée ouvre `<base source>.nervous.sqlite`. Le chemin
   provient du `PRAGMA database_list` de la connexion source réelle, jamais
   d'un identifiant d'agent ou du singleton global susceptible de changer.
   WAL, `synchronous=FULL` et transactions réelles isolent la projection.
3. L'inbox est durable ; sa projection en état, reçu et propositions est atomique
   et reprenable. Un même identifiant avec un autre contenu est rejeté.
   La capacité est bornée et la saturation explicite, sans éviction silencieuse.
4. Les réflexes sont des propositions, jamais des droits. Le branchement actif
   reste observationnel. `effectGate.dispatch` exige séparément `guarded`, un
   autoriseur de confiance et un handler explicite. Les gates/leases GenOS
   ne sont ni contournés ni remplacés ; leur raccordement à l'autoriseur reste
   obligatoire avant toute activation de handlers réels.
5. La prise d'un effet est atomique. Un handler reçoit une clé d'idempotence et
   un signal d'annulation. Timeout/exception produisent `UNCERTAIN` ; un crash
   après prise peut laisser `CLAIMED`. Aucun retry automatique dans ces états,
   aucune promesse d'exactly-once. Le handler doit respecter l'annulation et son
   protocole d'idempotence. Un retour normal vaut `EXECUTED_UNVERIFIED`, pas
   preuve de réparation.
6. Les graphes de propagation sont explicitement fournis, bornés et mono-tenant.
   Ils sont locaux au processus, sans découverte automatique des topologies,
   transport réseau ou persistance du graphe. Les reçus conservent son hash ;
   chaque processus doit reconfigurer son graphe au démarrage.
7. La panne du pont ne révoque pas la persistance primaire. Le rattrapage utilise
   un curseur par scope. Il ne récupère ni un événement perdu avant persistance,
   ni une source déjà purgée. Il n'existe pas de transaction atomique entre la
   base primaire et le fichier compagnon : le rattrapage reste nécessaire.

## Inspirations et limites biologiques

| Inspiration | Traduction logicielle |
| --- | --- |
| Interoception et régulation humaines | mesures internes, états d'alerte/récupération/repos et hystérésis |
| Contrôle périphérique animal | décision locale déterministe, sans attendre un LLM central |
| Signalisation systémique végétale | propagation bornée d'une alerte, atténuation, expiration et vigilance temporaire |
| Habituation et sensibilisation | filtrage réfractaire non urgent et priming borné après incident |

Les plantes n'ont pas de système nerveux neuronal : leur signalisation inspire
une analogie fonctionnelle, pas une affirmation anatomique. Les seuils et délais
logiciels sont des paramètres d'ingénierie à calibrer, non des constantes
biologiques validées. La couverture déclarée n'est pas une probabilité calibrée.
Les données absentes ou périmées valent inconnu, jamais sain.

Références primaires :

- Kleckner et al. (2017), *Evidence for a large-scale brain system supporting
  allostasis and interoception in humans*, DOI `10.1038/s41562-017-0069`.
- Zullo et al. (2019), *Motor control pathways in the nervous system of Octopus
  vulgaris arm*, DOI `10.1007/s00359-019-01332-6`.
- Toyota et al. (2018), *Glutamate triggers long-distance, calcium-based plant
  defense signaling*, DOI `10.1126/science.aat7744`.

## Frontières de confiance

Un rapport d'évidence reste une déclaration non vérifiée. Les hashes n'établissent
ni vérité, ni authenticité, ni non-répudiation : un administrateur local peut
modifier le fichier SQLite. La source d'observabilité doit être authentifiée et
scopée par les contrôles GenOS existants. Le nouveau module ne peut pas transformer
une mesure forgée en mesure fiable. Le mode observation empêche de confondre
l'entrée d'un signal avec une autorisation d'agir.

## Non implémenté et validation requise

Pas de raccordement automatique aux enchères AGOW, aux modèles Rust, aux huit
runtimes de topologie ou à un ordonnanceur distribué. Pas de dashboard web,
export OTLP supplémentaire ou propagation W3C complète. Pas de diagnostic LLM,
réparation autonome vérifiée ou boucle d'apprentissage fermée. Les capteurs
continus et les graphes doivent être branchés explicitement.

La suite ciblée utilise SQLite réel via `node:sqlite` et des connexions indépendantes
sur deux threads. Le test de branchement exécute le SQL de `telemetryPersist`
avec injection de dépendances. Ce n'est pas un démarrage complet du backend :
le driver natif `sqlite3`, la suite globale npm/Rust et les performances de
production ne sont pas validés par cette campagne.

Voir [le guide d'exploitation](../04-exploitation/systeme-nerveux-operationnel.md).
