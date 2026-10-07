# ADR 0357 — Rétraction des assemblées et mémoires dérivées

## Statut

Accepté, qualification partielle de L01, L03 et L22.

## Contexte

La signature d'une assemblée AEIS protège l'intégrité de la décision passée.
Elle ne fournit pas de moyen pour retirer cette assurance lors de la
découverte d'un contre-exemple. Un souvenir peut rester fidèle au rapport
alors que son assurance source a été retirée.

## Décision

Un journal durable `aeis_assembly_retractions` contient une rétraction par
assemblée. Son HMAC lie l'identifiant, le hash de l'assemblée complète, le run,
le scope, l'auteur authentifié, la justification et l'instant de rétraction.
La rétraction ne modifie ni les receipts ni le journal de promotion.

Le lecteur commun `aeisAssemblyStore.readAssembly` refuse par défaut une
assemblée rétractée. Les gates de promotion, les oracles mémoire et leurs
consommateurs passent par ce lecteur. Le contrôle de fraîcheur natif relit
également l'état avant utilisation d'une preuve déjà chargée.

La lecture historique explicite vérifie toujours les signatures, puis expose
la rétraction séparément. L'inspection affiche la décision acceptée à son
instant et l'assurance actuelle retirée ; le run historique reste terminé.
La recherche mémoire exclut les souvenirs dont l'assemblée source est
rétractée. Une rétraction corrompue provoque également un refus de lecture.

`POST /api/product-proofs/assemblies/:assemblyId/retract` exige la permission
`security:manage` et un tenant autorisé en écriture. Le corps fournit
`expectedAssemblyHash` et `rationale`. L'auteur vient du principal de la
requête, jamais du corps. Le service contrôle le tenant du run et le scope
signé de l'assemblée. Une reprise identique renvoie la rétraction enregistrée ;
un autre auteur, hash ou motif est un conflit. Il n'existe pas de réactivation.

Les assemblées rétractées échappent à la purge pour conserver la source du
journal. Elles peuvent donc dépasser la limite de rétention habituelle.

## Validation

Les sondes suivent une promotion native réelle, sa recherche mémoire,
la rétraction et l'inspection historique. Elles contrôlent le tenant étranger,
le hash périmé, deux connexions concurrentes, la reprise identique, le conflit,
la corruption du journal, la purge et la lecture depuis un processus frais.
Une sonde HTTP traverse les middlewares réels : anonyme, opérateur sans
permission, administrateur scoped, auteur forgé dans le corps et reprise.

## Limites

La justification exprime une décision de l'administrateur ; le service ne
prouve pas la vérité du contre-exemple. La rétraction porte sur l'assemblée
identifiée, sans propagation automatique vers toutes les assemblées qui
partagent un résultat ou vers tous les autres magasins mémoire. Un rollback
malveillant de la base complète n'est pas détecté par un ancrage externe.
Les effets déjà appliqués ne sont pas annulés. Une décision ou un résultat
déjà livré à un client reste historique ; ses nouvelles utilisations doivent
relire l'assurance. Les allocations durables mémoire, l'oracle code, les
pilotes comparatifs et les 115 obligations globales P1 restent ouverts.
