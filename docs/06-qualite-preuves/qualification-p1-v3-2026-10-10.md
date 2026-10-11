# Qualification P1 avec la V3 du 2026-10-10

P1 conserve ses **115 obligations** dans **L01 à L05 et L22**. Cette qualification
ajoute des intégrations et contre-épreuves ; elle ne déclare pas ces six lots
achevés. Le [programme canonique](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922)
a été relu intégralement le 2026-10-10.

## Changements récents pris en compte

| V3 | Effet à qualifier | Limite maintenue |
| --- | --- | --- |
| ADR 0375 | Capacités de snapshot déclarées selon l’hôte | Aucune restauration de RAM de processus ou contexte fournisseur |
| ADR 0377, 0381, 0382 | Références scientifiques, autorité durable et publication ciblée | Compilation réelle exigée ; pas de bootstrap mathématique autonome implicite |
| ADR 0378 | Reprise durable des leases GQWF | Préparations récupérables lorsque les écrivains sont arrêtés ; quarantaine conservée |
| ADR 0379 | Délégation descendante bornée par l’allocation du parent | Un candidat ne s’octroie pas de nouveaux droits |
| ADR 0380 | Journal de compensation des restaurations d’organisme | Pas d’atomicité globale sur les effets externes ; verrou Rust orphelin à traiter |
| ADR 0383 | Contexte mémoire et économie de tokens conditionnée aux preuves | Tokens estimés distingués des mesures ; transport réussi sans récompense métier |
| ADR 0384 | Mise en file durable de décisions MCP pour des destinataires explicites | Un reçu de mise en file ne prouve ni lecture, ni assimilation, ni consensus |
| ADR 0385 | Contrat de snapshot topologique avec recapture avant reprise | Plan `verify-only`, `restorable: false` ; aucun rembobinage collectif |
| ADR 0386 | Restauration de snapshot logique par l’entrée backend temporelle | Opt-in et portée serveur ; hors catalogue public stdio ; aucun transfert de conscience |

Le checkout est partagé avec d’autres travaux V3. Les tests globaux concernent
son état pendant l’exécution ; une capsule immuable identifie séparément les
sources utilisées par les pilotes. Les modifications étrangères ne sont pas
attribuées au présent travail.

## Intégrations ajoutées

L04 relie maintenant une nursery GVX à des forks procéduraux réellement
exécutés. La reprise conserve leur résultat et refuse un scope étranger,
un contrôle différent, un artefact modifié ou une observation d’aléa forgée.
Le cache générique revérifie aussi l’identité des preuves. Les drapeaux de
causalité, d’autorité runtime et de promotion restent faux.

L05 dispose d’une projection de dataset versionnée qui retire la partie
évaluateur avant l’appel au runner. Son hash est conservé dans les résultats
et exigé dans le reçu de métrique. Un reçu signé avec un hash absent ou faux
est rejeté avant persistance du résultat. L’isolation OS reste absente ; les
datasets historiques restent explicitement non attestés.

L01/L03 ont une qualification Lean réelle de publication scientifique et de
relecture dans un processus frais. Lean 4.34.0 accepte `0 = 0` et rejette
`(0 : Nat) = 1`, même si un producteur mensonger émet préalablement un reçu
« passed ». La corruption des octets durables et un scope étranger sont refusés.
Le binding local porte sur l’exécutable, sans audit transitif des imports.

La factory `createScientificMathematicalRuntime` est également initialisée et
son `step()` exécuté avec Lean réel : six compilations positives (gate puis
autorité pour trois tentatives) publient trois références de `∀ n : Nat,
n + 0 = n`. Trois compilations de `(0 : Nat) = 1` échouent ; aucune référence
supplémentaire n’est publiée. Les stratégies nommées utilisent encore le même
corps `simp` dans ce parcours, sans découverte de preuve autonome ni bootstrap
automatique du serveur.

## Reproduction indépendante et incidents conservés

Le sous-agent autorisé n’a reçu aucun score primaire. Sa première qualification
de la capsule a échoué : `spec/gvx-experiment-manifest.schema.json` manquait
dans l’inventaire du gel. Le défaut est corrigé pour les nouvelles capsules.
La capsule initiale reste immuable ; un sidecar complète le schéma avec le hash
`72915989b47ac33335e49149bfa786cd1b84b855d2026115dc669a1d20fc89f1`.

Les trois suites initiales et dix groupes de contre-épreuves indépendantes
passent avec ce complément : enveloppes invalides, seed non déclarée,
snapshot modifié, refus d’attestation et reprise stable. Ces tests n’exécutent
pas de modèle IA et ne sont pas une reproduction des scores des pilotes.

Le premier préflight Ollama échoue avant inférence : `llama-server.exe` est
absent. Une copie isolée de l’archive officielle 0.40.2 sur D rétablit le
service ; le hash du binaire est identique à celui de l’installation existante.
Une vraie inférence `qwen2.5-coder:7b` répond ensuite. L’archive est vérifiée
contre le fichier SHA-256 de la publication officielle.

## Pilotes IA et reproduction des scores

Deux opérateurs distincts exécutent la même capsule figée
`2172f1adf88295d6b2c159c9e4c185d2bce6ac9fe352cf458979c1dd310976f9` :
3 421 sources et 8 015 dépendances. Le second n’a reçu ni consulté les scores
primaires avant de rendre son rapport. Les seeds sont respectivement 801 et 802.
Le modèle local est `qwen2.5-coder:7b`, température 0, digest
`dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364`.

Chaque collecte conserve 96 résultats, 160 appels scorés et un appel de chauffe,
sans erreur d’appel ni dérive de sources ou dépendances. L’adjudication séparée
est éligible à la comparaison exploratoire, avec zéro fuite détectée par ses
sondes ; cela ne démontre pas l’absence de toute contamination sur l’hôte.
Les budgets par bras sont ceux du protocole gelé : deux appels par cas code
et raisonnement, un appel par cas mémoire ; les coûts natifs et latences sont
conservés dans les résumés. La reproduction mesure 44 961 tokens d’entrée et
2 704 de sortie pour les 160 appels scorés, sans appel non mesuré.

| Domaine / bras | Primaire, seed 801 | Reproduction, seed 802 |
| --- | --- | --- |
| Code direct | 6/8 | 6/8 |
| Code avec outils | 8/8 | 6/8 |
| Code GenOS | 8/8 | 6/8 |
| Code sans gate de preuve | 7/8 | 4/8 |
| Mémoire brute | 7/8 | 7/8 |
| Mémoire GenOS | 8/8 | 8/8 |
| Mémoire sans frontière de confiance | 7/8 | 7/8 |
| Mémoire sans retrieval | 8/8 | 8/8 |
| Raisonnement, chacun des quatre bras | 0/8 | 0/8 |

Le raisonnement conserve ses échecs : les propositions de preuve sont refusées
par Lean 4.34.0 ; les bras avec outils et GenOS abstiennent dans les huit cas.
Aucun échec n’est exclu pour améliorer les scores. Le gain code n’est pas
reproduit contre le bras direct ; la mémoire ne démontre pas de gain du
retrieval. Les deux campagnes réutilisent huit tâches P0 par domaine et ne sont
pas réunies comme seize tâches indépendantes. Leurs neuf contrastes, intervalles
bootstrap et tests de discordance sont descriptifs, sans validation confirmatoire
ni généralisation à une capacité IA représentative.

La capsule précède le renforcement final du binding des preuves en cache.
La reproduction indépendante de ce renforcement et du reçu de métrique signé
se fait séparément sur deux tests du checkout, avec copies des sources et
hashes avant/après ; les scores ci-dessus ne lui sont pas attribués.

## Vérifications du checkout

| Commande | Résultat conservé | Limite |
| --- | --- | --- |
| `python scripts/ci/check_code_quality.py` | 5 704 sources, quatre violations historiques, aucune nouvelle | Le mode global strict reste en échec sur cette dette antérieure |
| Contrôle strict des sources modifiées ici | 15 sources, zéro violation | Aucun changement de baseline ni annotation de contournement |
| `npm test` | Succès, dont les quatre suites P1/V3 | État partagé pendant l’exécution ; aucune preuve universelle de tous les parcours |
| `cargo test --workspace` | Succès, sortie 0 | Tests Rust, pas restauration de contexte fournisseur |
| Suites backend MCP et gRPC | Succès, sorties 0 | Contrats ciblés ; les 41 Ping ne sont pas 41 preuves de parité métier |
| `npm run qualify:p1-lean` | Succès avec Lean réel, producteur et processus frais | Binding de l’exécutable, stratégie fixe `simp`, imports transitifs non audités |

Les tentatives globales précédentes restent archivées : course d’expiration
de lease corrigée dans la fixture, fichier de test V3 momentanément absent,
puis refus d’une promotion avec un seul acteur valide. La dernière tentative
réussit avec deux reçus indépendants ; la cause du précédent résultat à un
acteur n’est pas établie. Des avertissements de poll SQLite après fermeture
subsistent dans les journaux ; aucun nettoyage universel n’est revendiqué.

Le moteur Docker Linux local est indisponible et les deux distributions WSL
observées sont en version 1. La tentative de démarrage Docker est arrêtée sans
conversion de WSL ni changement des fonctionnalités Windows. Le confinement OS
et les essais de fuite associés restent donc ouverts.

La régression Rust révèle un test de mutex empoisonné dépendant d’un fournisseur
IA disponible. Il utilise maintenant la simulation explicite sous le verrou
partagé prévu par la suite, tout en vérifiant une vraie requête HTTP après
empoisonnement. Le test d’expiration de lease remplace un délai de 30 ms,
qui pouvait expirer avant le scellement, par une horloge contrôlée au seuil
exact d’expiration ; les contrôles de production ne sont pas assouplis.

Deux tentatives de qualification Lean échouent avant réception des diagnostics
du processus. La tentative instrumentée, avec un budget explicite de 90 s,
passe et conserve les sorties du compilateur, dont le refus de la proposition
fausse. La cause des deux premiers échecs n’est pas établie ; aucun correctif
d’intermittence du compilateur n’est revendiqué.

## Preuves et clôture

Les journaux et résultats volumineux sont conservés hors Git sous
`p1-v3-20261010`, dans le dossier de preuves de cette conversation. Les pilotes
V3 réutilisant le corpus P0 sont des régressions exploratoires : ils ne deviennent
pas des campagnes confirmatoires P1 par ajout d’une seed ou d’un opérateur.
Les sorties `npm-complete-v3-recheck.log`, `cargo-complete-qualified.log`,
`quality-final.log`, `lean-producer-qualified.log` et
`reproduction/schema-reproduction-summary.json` identifient les preuves finales.
Les prompts, réponses, reçus d’oracle et mesures de coûts des deux campagnes
sont conservés avec leurs empreintes hors Git.

Les obligations restantes comprennent notamment le confinement et la recherche
de fuites interbranches, les providers stochastiques, les effets externes,
les holdouts représentatifs inaccessibles aux candidats, le calcul de puissance
et la parité sémantique complète des consommateurs L22. Le
[registre des obligations](obligations-cloture-p1.md) reste la source de portée.
