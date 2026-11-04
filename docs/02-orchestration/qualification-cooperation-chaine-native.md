# Qualification de coopération par la chaîne native

Le pilote `backend/bin/qualify-worker-cooperation-live.cjs` produit un rapport
`genos.worker-cooperation-live/v4`. Il reçoit un fichier JSON contenant une
nouvelle racine absolue sur D:, un modèle `ollama://…` et le scénario
`incorrect` ou `healthy`. Le serveur Ollama doit exposer `/api/chat` ; son URL
se transmet par `GENOS_OLLAMA_ENDPOINT`.

```powershell
node backend/bin/qualify-worker-cooperation-live.cjs D:\GenOS-runs\mon-essai.json
```

Le processus prépare une base, un catalogue ADN et des capsules propres à cet
essai. Il active les génomes existants par les admissions normales, sans
désactiver la politique de confiance ou de signature. Les secrets locaux sont
dans `private/` ; ni ces secrets, ni la base, ni les capsules ne vont dans Git.

Le parcours est : bootstrap et corps du parent → daemon → constat vérifié par
deux processus d'oracle → planificateur routé → spécialiste → vérificateur
distinct → restauration déterministe si nécessaire → dossier natif du parent
→ clôture de mission. Un état sain doit entraîner `stop`, sans réparation.
L'oracle peut opposer son veto à toute réponse du modèle.

La fabrique fournit les génomes et baux effectifs. Les reprises sont attendues
avant de lire la preuve terminale et la nouvelle identité éventuelle est
rattachée à sa provenance. L'arrêt final annule uniquement les travaux encore
pendants et conserve les échecs dans les mesures. Il ne transforme jamais une
annulation en réussite.

Les forks lient leur lignée au workspace final de leur capsule avant le
démarrage. Le génome hérité et les références au worker source et au parent
restent conservés ; les arcs de lignée ne traversent pas les workspaces.
Le superviseur transmet aussi à la supervision l’identité de contrôle préparée
pour le processus enfant. Sans cette liaison, une reprise peut démarrer un
processus puis échouer avec une référence JavaScript absente, laissant un
processus sans supervision malgré un rapport terminal. Les parcours négatifs
contrôlent également la sortie du processus, au-delà de `shutdown.stopped`.

Le rapport détaille les reçus de chaque tentative, même lorsqu'une reprise
échoue pour une autre raison que la première observation refusée.

Les options `--success-only`, `--negative-only` et `--fork-only` du test
`backend/tests/test_worker_cooperation_live.cjs` permettent de cibler les
parcours contrôlés. Ces transports HTTP de test ne sont pas de vrais LLM.
`GENOS_COOPERATION_KEEP_TEST_ARTIFACTS=1` conserve leur répertoire temporaire
pour auditer un refus. Les secrets de ce répertoire restent hors Git.

Le bail fourni au modèle est distingué de l'autorité scellée du runtime.
`executionEnvelopeContract.toolLease` ajoute officiellement `genos_replay`
aux workers pour le rejeu natif après résultat. Le contrôle de couverture
applique cette même politique et refuse tout autre élargissement ; ce rejeu
ne doit pas être attribué à un appel d'outil du LLM.

La réserve parent commune est de 68 096 tokens et 1 USD fournisseur, pour
720 000 ms ; l'allocation nominale des workers est de 64 000 tokens au total.
Chaque worker reçoit au plus 16 000 tokens, 0,25 USD et 180 000 ms. Le
planificateur dispose de 4 096 tokens au total, dont au plus 768 en sortie.
L'allocation nominale de 64 000 n'est pas un second plafond collectif séparé :
la réserve de 68 096 est le plafond commun appliqué aux appels et reprises.

Le journal fournisseur ne suffit pas à certifier un comptage complet : les
reçus de toutes les identités de reprise doivent également avoir leurs
registres de coût mesurés. `knownModelTokens` conserve le sous-total des
inférences mesurées ; `unmeasuredWorkerRuns` décrit les lacunes natives.
Une lacune rend `complete:false` et `modelTokens:null`. Elle ne vaut jamais
zéro token. Une relecture des reçus peut corriger le comptage d'un essai
conservé sans réécrire ses réponses ni déclencher une nouvelle inférence.

`qualified` requiert la fin du protocole, la clôture native, la couverture,
l'arrêt propre et une mesure complète dans le plafond. `genosMissionQualified`
n'est établi qu'après les portes natives ; `promoted` reste faux. La présence
d'une table ou d'un nom de module n'est pas une preuve d'utilisation.

Le relevé distingue les capacités activées et celles hors périmètre. Il ne
prétend pas utiliser tous les outils MCP, toutes les topologies, une recherche
Web ou une évolution génétique lorsque la mission n'en a pas besoin.

Voir [ADR 0796](../adr/0796-banc-cooperation-chaine-native.md). Les résultats du
vrai modèle sont consignés séparément, avec commit source et empreintes des
artefacts ; les fixtures HTTP ne constituent pas une qualification LLM.

Les [résultats du 4 novembre 2026](resultats-qualification-cooperation-native-2026-11-04.md)
distinguent les fixtures natives, les refus Qwen réellement mesurés et la
relance réelle achevée, avec son verdict et ses limites de mesure.
