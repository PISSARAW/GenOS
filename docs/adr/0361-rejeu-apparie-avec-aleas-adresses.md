# ADR 0361 — Rejeu apparié avec aléas adressés

## Statut

Accepté, extension partielle L01/L02/L04.

## Contexte

Le replay causal procédural persiste snapshots, forks, checkpoints et diffs.
Il compare des seeds déclarées et des identifiants de runner. Ces champs ne
prouvent pas que le même code ou les mêmes aléas sont utilisés. Un générateur
séquentiel partagé par seed diverge si une branche fait un tirage supplémentaire.
Une analyse conservée en cache peut également masquer une source devenue invalide.

## Décision

Le protocole opt-in `genos.paired-replay/v2` étend les services et primitives
procéduraux existants. Son `replayContract` contient exactement `schema`,
`scope` et `events`. Le scope lie organisation, projet et entité. Chaque
événement déclare `id`, `payload` JSON et `slots`, de 1 à 16. Les identifiants
sont distincts, les événements limités à 128 et le contrat à 256 Kio.
Les champs sensibles sont refusés selon le contrôle public commun.

L'admission résout le runner, les snapshots et l'environnement depuis le
registre runtime. Elle compare les snapshots et l'environnement déclarés
aux valeurs effectivement enregistrées. Elle calcule le SHA-256 du texte
retourné par `Function.prototype.toString` pour le runner. Les fonctions
natives, liées ou opaques retournant `[native code]` sont refusées.
Un `runnerHash` fourni doit correspondre à cette source observée.

Le hash du protocole lie l'expérience, la version, le runner et sa source,
l'environnement, les états et hashes des snapshots, les bras, les seeds,
le budget, l'analyse et le contrat d'événements. Les colonnes
`replay_contract_json` et `replay_protocol_hash` sont ajoutées de manière
idempotente. Chaque `FORK_CREATED` conserve ce hash. Changer le protocole,
même en recalculant son hash, refuse la reprise du fork existant. Le scope
est requis pour créer un fork, reprendre, comparer et dériver ces preuves.

Le contexte runtime fournit `pairedReplay.events`, cloné et gelé en profondeur,
et `pairedReplay.randomFor(eventId, slot)`. L'algorithme
`sha256-event-slot/v1` hash le tuple algorithme, seed, événement, slot ; ses
52 premiers bits produisent un nombre dans `[0,1[`. Chaque adresse conserve
la même valeur, indépendamment du nombre et de l'ordre des autres demandes.
Une adresse ou un slot non déclaré est refusé.

L'observateur conserve les adresses réellement demandées, leurs valeurs et
leurs compteurs. Le runner ne fournit pas ce relevé. Le checkpoint et le
résultat final le lient au protocole, à la source du runner et à la seed.
La reprise relit le relevé du dernier checkpoint et vérifie l'état et la
version contre cet événement. Un état auto-cohérent dont le hash diffère
de celui du checkpoint est refusé.

Le protocole et le registre sont relus avant les checkpoints et la clôture.
La liaison actuelle est aussi contrôlée dans la transaction qui écrit le
checkpoint ou le résultat. Un runner ou protocole modifié pendant le parcours
ne produit pas de `RUN_RESULT` accepté. Le lease existant interdit à deux
connexions de reprendre le même fork simultanément.

Le diff confronte les deux forks achevés, leur snapshot, leur seed et leur
protocole, puis recalcule chaque valeur d'aléa observée. Il décrit les adresses
communes sans supposer que les deux branches ont demandé toutes les mêmes
adresses. Sans adresse commune réellement observée, il refuse
`CAUSAL_PAIRED_RANDOMNESS_UNOBSERVED`, même si les deux forks sont achevés.
Il conserve `causalGuarantee: false` et `runtimeAuthority: false`.
Un conflit avec un diff déjà persisté est refusé, au lieu de renvoyer un
identifiant qui n'a pas été enregistré après `INSERT OR IGNORE`.

Les analyses multi-snapshots et les graphes du nouveau protocole vérifient
scope, intégrité et références actuelles dans une transaction. Les diffs sont
recalculés depuis leurs forks avant usage ; une analyse référencée dans un
graphe entraîne la relecture de ses diffs. Les dérivations conservent les
limites de causalité et d'autorité, malgré un éventuel verdict statistique positif.

## Compatibilité

Les expériences historiques gardent leur protocole et leurs diffs sans
relevé d'aléas ajouté rétrospectivement. Leur seed reste déclarée, non observée.
La rétrogradation d'un fork créé sous le nouveau protocole est refusée même
si les colonnes ajoutées sont vidées. L'adaptateur SQLite historique reçoit
toujours les paramètres multiples sous forme de tableau.

## Validation

La suite `test_paired_causal_replay.js`, découverte par `test:p1-socle`, utilise
le registre réel, les handlers de primitives et SQLite. Deux snapshots et
trois seeds exécutent douze forks ; le défaut injecté au deuxième événement
est localisé à l'index 1. Un tirage supplémentaire dans le bras intervention
ne décale pas les trois adresses communes. Le snapshot enregistré reste intact.
Une interruption après checkpoint reprend dans un processus Node frais.

Deux connexions SQLite réelles disputent un lease ; une seule écrit un résultat.
Les refus couvrent scope étranger, runner remplacé sous le même identifiant,
environnement modifié, adresse invalide, mutation des événements, source opaque,
substitution du protocole, rétrogradation et état détaché du checkpoint.
Un changement de protocole après le premier commit de checkpoint refuse le suivant.

Une nouvelle observation fausse est ajoutée avec une chaîne de hashes cohérente :
le diff, l'analyse et le graphe la refusent malgré leurs anciens caches.
Les tests historiques des forks et du parcours des primitives restent exécutés.
La sonde historique est lancée avec une base et des racines temporaires explicites
sur D: ; une première tentative avait atteint la base par défaut et signalé
un échec de sauvegarde par manque d'espace. Cette tentative échouée n'est pas
utilisée comme preuve de qualification ; la base par défaut est conservée.

## Limites

Le contrôle porte sur la source textuelle du runner enregistré, pas sur ses
closures, l'ensemble de ses dépendances, ses accès réseau ou ses globaux mutables.
L'observation ne capture que les appels à `randomFor` ; elle ne contrôle pas
`Math.random`, l'horloge ou la stochasticité des providers. Les branches sont
des états clonés dans le runtime ; ce contrôle ne prouve pas un confinement OS.

Le comptage est explicitement `checkpointed-state-and-final-segment-only` :
les demandes postérieures au dernier checkpoint d'un segment interrompu ne
sont pas un coût complet conservé. Cette extension ne qualifie pas les budgets
effectivement dépensés, les crashes durs, l'exécution exactement une fois ou
les effets externes annulables. La chaîne SHA-256 détecte des incohérences ; elle
n'est pas une authentification face à un acteur capable de réécrire toute la base.

Les données sont des fixtures synthétiques publiques. Le signal et le bootstrap
servent à vérifier le raccordement ; ils ne prouvent ni un gain IA ni une
puissance statistique représentative. La bisection causale générale, les
interventions sur providers, les holdouts, le raccordement au nursery GVX et
la reproduction en clone indépendant restent ouverts. Les 115 obligations
et les six lots P1 ne sont pas clôturés.
