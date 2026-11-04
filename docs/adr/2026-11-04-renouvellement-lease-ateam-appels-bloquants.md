# Renouvellement de la lease A-Team pendant les appels attendus

- **Statut** : Implémenté — service et tests de lease ; aucune qualité artistique certifiée.
- **Dernière revue** : 2026-11-04.

## Contexte

La tentative 8 du Dernier Sas dure 1 546,462 secondes. Le dispatcher attend
le premier worker avant d'entrer dans la boucle des stages. La lease de vingt
minutes expire pendant cette attente : l'entrée suivante du runner est refusée
par `ATEAM_RUN_LEASE_LOST`. Un refus OMEGA du worker demeure une cause distincte.
Les sept scènes et les deux candidats conservés n'autorisent aucune livraison.

## Décision

Un service de lease commun conserve la durée existante de vingt minutes et le
seuil de renouvellement de deux minutes. Il observe la lease toutes les trente
secondes pendant l'attente des producteurs initiaux et des workers dépendants.
Chaque renouvellement modifie seulement l'expiration et la révision du run.

L'écriture SQLite exige atomiquement le même token, la révision courante, un
run `RUNNING` et une expiration encore future selon l'horloge de SQLite. Un
conflit de révision autorise au plus trois lectures/tentatives ; chaque lecture
revalide le propriétaire et l'expiration. Une lease expirée ou reprise n'est
jamais ressuscitée par ce mécanisme. Il ne réclame pas une nouvelle lease.

Le heartbeat est sérialisé et arrêté à la sortie du callback, y compris sur
erreur. La perte de lease empêche de retenir son résultat dans la continuation
du runner. Elle ne fabrique pas une annulation d'un appel fournisseur déjà
parti : ce dernier reste soumis à sa propre autorité et à ses budgets natifs.
Les échéances de mission, budgets, preuves, handoffs et gates restent inchangés.

## Conséquences et vérification

`test_ateam_runner_lease.cjs` utilise SQLite réel et les services canoniques de
run. Il vérifie le renouvellement pendant un callback encore en attente,
l'arrêt du timer, le refus d'un autre propriétaire et d'une lease expirée,
ainsi qu'une expiration entre la lecture et l'écriture SQL retardée. L'erreur
originale d'un worker demeure une erreur et ne devient pas un succès.

La tentative antérieure conserve ses états et reçus d'origine. Une nouvelle
mission est nécessaire pour mesurer ce raccord ; les tests de lease ne prouvent
ni une acceptation GQEL ni une amélioration artistique.

## Alternatives

- Allonger statiquement toute lease : maintien excessif de l'autorité d'un runner arrêté.
- Réclamer une nouvelle lease après expiration : rejeté, car l'ancien runner ne possède plus l'autorité.
- Ignorer le refus lors du retour du modèle : rejeté, car un texte produit ne rétablit pas une lease perdue.
