# ADR 0359 — Coûts durables des oracles refusés et interrompus

## Statut

Accepté, extension partielle L02/L03/L22, 2026-10-07.

## Contexte

Un oracle peut terminer son processus avant que le contrôle actuel du sujet
refuse son résultat : source rétractée, nouveau rapport ou échéance dépassée.
Le refus perdait alors les observations du processus ; la réservation restait
visible sans coût. Une absence de preuve sémantique ne signifie pas une
absence de dépense. Une interruption ne doit pas être convertie en coût nul.

## Décision

La réservation native déclare `genos.native-oracle-execution/v1`. Son journal
GVX scellé conserve, pour chaque stratégie autorisée, une intention avant le
lancement et un fait final après la fermeture du processus. Ils lient le run,
l'agent et le hash d'allocation à l'identifiant d'exécution, à l'entrée hachée,
au programme, au répertoire, à l'échéance et aux mesures finales. Une intention
déjà enregistrée interdit un second lancement pour cette stratégie.

Les coûts proviennent de ces faits plutôt que des seuls receipts acceptés.
Ils restent disponibles quand le contrôle sémantique échoue. Les adapters
conservent les observations réelles dans leur résultat d'erreur ; le
coordinateur enregistre un abandon séparé si la clôture échoue. Le reçu
biologique terminal inclut une référence d'allocation et les coûts observés,
même pour un worker refusé. Un worker natif déterministe déclare également
ses usages de modèle et de provider à zéro sur son parcours d'échec.

Une intention sans fait final expose `complete: false`, les observations
déjà connues et des totaux `processes` et `runtimeMs` à `null`. Le processus
a pu être lancé sans que sa fermeture soit observée. La réservation demeure
consommée ; une reprise, même dans un processus frais, ne relance pas le
batch. Une réservation ancienne dépourvue de ce suivi expose
`legacy_untracked` et des coûts inconnus.

Les nouvelles attestations doivent correspondre au journal complet sous
leur allocation. Ce contrôle dépend du schéma de la réservation ; retirer
un champ de coût de l'attestation ne permet pas de choisir la compatibilité
historique. L'authentification du journal seule ne prouve pas cette cohérence.
Une preuve positive exige toujours les deux processus, les budgets et tous
les contrôles existants d'autorité, de sujet, de receipts et de nonces.

## Validation

La sonde lance les workers et les oracles réels dans des bases temporaires.
Après le premier oracle elle rétracte la vraie source mémoire, publie un
nouveau rapport contradictoire par le parcours de production ou expire
l'échéance du batch. Chaque abandon conserve le processus et sa durée,
son reçu biologique refusé et sa relecture dans un processus frais.

Un processus de contrôle enfant est arrêté dans deux fenêtres : après
l'enregistrement durable de son intention, puis après la fermeture réelle
d'un oracle mais avant l'enregistrement de son fait final. La seconde sonde
observe un PID, un code de sortie zéro et des postconditions vérifiées avant
l'arrêt du contrôle plane. Dans les deux cas, le journal conserve l'état
incomplet et des totaux inconnus ; les reprises refusent le relancement.
La trace observée avant le crash reste dans le journal de test, sans être
transformée en fait durable de production. Une attestation volontairement privée du
champ `complete`, mais authentifiée par le journal réel, échoue au contrôle
de liaison aux coûts mesurés. Les scénarios utilisent des processus distincts
pour éviter la réutilisation de connexions SQLite mises en cache.

## Limites

Les sondes de crash couvrent les fenêtres après intention et avant lancement,
puis après fermeture de l'oracle et avant fait final. Elles ne qualifient pas
tous les crashes, les échecs d'écriture disque, les processus
orphelins ou l'exécution exactement une fois. Les intentions non résolues
restent inconnues et exigent un nouveau run ; aucune reprise transparente
n'est promise. Le rollback de toute la base n'est pas détecté ici.

Le temps est une durée locale observée, sans mesure du coût CPU ou du prix
local en dollars. Le batch direct AEIS conserve son budget local ; le journal
durable concerne les méthodes natives de run déjà intégrées. Le contrôle
d'exécution et la qualification scientifique restent distincts.

Les autres domaines, l'oracle code, les campagnes représentatives, les
holdouts et la reproduction indépendante restent ouverts. Les 115 obligations
P1 et L01–L05 ainsi que L22 ne sont pas clôturés.
