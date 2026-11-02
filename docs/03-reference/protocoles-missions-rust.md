# Missions natives Rust et protocoles spécialisés

`genos run --executor rust` utilise un exécuteur Rust de
`genos-orchestrator::mission_protocols`, avec workers de `genos-worker::native`.
Il ne lance pas Node et ne se replie pas sur un fournisseur de modèles. Le
chemin `--executor codex` conserve son pont Node et son vérificateur Rust.

## Domaine installé

Le premier profil natif est `integer_sum` : un fichier JSON de 1 à 4096 entiers,
chacun compris entre -1000000 et 1000000, limité à 64 KiB. Un producteur calcule
la somme ; deux autres processus Rust la recomputent par parcours inverse et
par regroupement des occurrences. Le critère accepté est exactement
`integer_sum_verified`. Un `expectedSum` explicite constitue une obligation
supplémentaire ; son absence n'autorise aucune autre revendication métier.

Les trois processus exécutent le même binaire installé, dans trois rôles
distincts avec nonce, PID, audience, environnement et politique liés. Cela
n'établit pas trois autorités indépendantes ni une vérité générale sur une
consigne libre. Les autres domaines, contrats de complétion et options non
installés sont refusés.

## Exécution

Exemple PowerShell 7 depuis le dépôt, avec un workspace existant contenant
`numbers.json` dont le contenu est `[7,-2,4]` :

```powershell
$objectifs = '[{"goal":"Calculer la somme","successCriteria":["integer_sum_verified"],"methodContract":{"version":1,"methodId":"integer_sum","parameters":{"inputPath":"numbers.json","expectedSum":9}}}]'
cargo run -p genos-cli -- run "Somme vérifiée" --executor rust --workspace-root D:/work/native-sum --mission-id 7f6fc897-31fa-487f-92be-3dad46c22f78 --native-objectives $objectifs
```

Le résultat est publié dans le CAS SQLite local et affiché sous le schéma
`genos.rust-native-mission/v1`. Ce profil n'écrit pas un fichier de résultat
arbitraire dans le workspace. L'entrée reste en lecture seule ; le journal
privé est `<workspace>/.genos-native/mission-protocols.sqlite` avec ses fichiers
SQLite auxiliaires. Ce dossier généré est ignoré par Git.

## Frontières obligatoires

| Protocole | Usage réel |
| --- | --- |
| [CONTINUITY](rust-continuity-runtime.md) | Registre de génération indépendant des checkpoints et fencing dans chaque transaction métier |
| [MORPH](rust-morph-runtime.md) | Installation atomique de la roster dont les identités sont réellement utilisées pour lancer les processus |
| [SYNAPSE](synapse-missions-rust.md) | Application de trois contextes adressés, puis relecture avant la construction des entrées des workers |
| [ALLOSTASIE](allostasis-runtime-rust.md) | Exposition durable avant lancement, règlement du temps observé même en échec et consommation conservée |
| [OMEGA](omega-runtime-rust.md) | Graphe installé READ, SELECT, calcul, vérifications et EMIT ; une intention sans résultat ne permet pas une relance |
| [EVIDENCE](evidence-missions-rust.md) | Trois reçus de processus, contextes courants, prédicat ADMIT et identités de roster exacts avant acceptation |
| [GQWF Exchange](gqwf-exchange-runtime-rust.md) | Transfert rehashé des objets source, résultat et fermeture entre namespaces CAS puis CAS de tête |

La tête, le reçu de publication, le reçu OMEGA d'émission et le statut de mission
terminée sont inscrits dans la même transaction SQLite. Un succès de transport,
un code de sortie zéro ou une chaîne contenant `verified` ne remplace pas cette
qualification.

## Reprise et limites

Relancer la même commande, avec le même UUID et la même requête pendant le bail,
relit la publication committée sans relancer les trois processus. Une source,
une requête ou un environnement modifié est refusé. Une issue restée inconnue
avant publication demeure bloquée ; un checkpoint n'accorde pas de nouvelle
autorité. Une succession ne rembourse ni consommation passée ni exposition
inconnue, et ne réautorise pas une opération déjà effectuée.

Les réserves protégées représentent 5 % du temps et des slots. Le profil limite
la mission à trois invocations, avec métriques de processus et de temps mural.
Il ne convertit pas le métabolisme biologique en tokens de modèle ou en USD.

Le stockage et le binaire locaux sont de confiance opérateur. Les chemins
relatifs sont confinés et les liens symboliques, reparse points et hardlinks
sont refusés, y compris pour le journal SQLite et ses auxiliaires. Ce profil
n'est pas une sandbox contre un administrateur hostile du disque.

MORPH utilise un installateur local ; il ne simule aucun quorum distant READY.
GQWF utilise des namespaces locaux, sans annoncer de transfert réseau. SYNAPSE
utilise le format canonique installé, sans nouveau dialecte portable. Les
anciennes simulations biologiques ne sont pas présentées comme ce nouvel
exécuteur métier.

L'[ADR](../adr/2026-11-02-protocoles-runtime-rust.md) décrit les points de livraison.
