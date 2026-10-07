# ADR 0358 — Vérification mémoire native sous budget durable

## Statut

Accepté, extension partielle L02/L03/L22.

## Contexte

L'oracle de fidélité mémoire dispose de processus frais et de receipts AEIS.
Son batch direct ne réserve pas durablement un budget et ne constitue pas
une clôture de run. Le run qui a produit la mémoire a déjà dépensé ses
exécutions de vérification ; il ne doit pas financer implicitement ce batch.

## Décision

La méthode native `verify_memory_fidelity`, version 1, est disponible pour
`verifier_worker`. Ses paramètres sont `memoryId` et `expectedBindingHash`,
hash de la liaison de provenance mémoire contrôlée par le serveur. Le worker
résout le souvenir depuis son tenant persistant ; il ne reçoit ni texte
source arbitraire ni chemin de vérification choisi par le candidat.

La délégation conserve le plafond de profondeur et les compteurs existants.
Le nouveau run possède sa propre enveloppe d'autorité, son budget scellé et
son observation typée `verification_report`. Son verdict est confronté à
la mémoire et au rapport d'origine. Le résultat conserve explicitement
`sourceTruth: not_evaluated`.

Le journal natif commun réserve une seule allocation de deux processus et
une échéance totale, distincte du budget du producteur. Un registre fermé
sélectionne `subset_sum` ou `memory_fidelity` depuis la méthode persistée.
Le candidat ne choisit pas le domaine du gate. Les deux oracles mémoire
utilisent cette allocation et cette échéance ; les receipts lient le run
de vérification, le run source, la mémoire, les bindings et l'observation.

L'assemblée, la clôture et la promotion différée passent par le gate natif
commun. Deux nonces sont consommés au point de décision. La relecture
contrôle l'autorité actuelle, les données sources, le rapport, le domaine,
l'implémentation du verifier, les signatures et les coûts. Une source
rétractée, une mémoire changée ou une preuve expirée empêchent l'utilisation
actuelle, sans réécrire l'acceptation historique.

Une concurrence ou reprise retrouve l'attestation scellée et ne lance pas
un second batch. Une réservation interrompue avant attestation reste
consommée ; un nouveau run est nécessaire. Cela ne qualifie pas l'exécution
de processus exactement une fois après tous les crashes.

## Validation

La sonde part d'une vraie délégation native, approuve sa promotion et retrouve
la mémoire liée. Elle lance le worker mémoire sous son propre contrat,
provoque la concurrence sur deux connexions et reprend dans un processus
frais. Elle contrôle l'assemblée, les deux allocations distinctes, quatre
nonces au total, l'approbation réelle et sa reprise sans nouvelle consommation.

Les budgets insuffisants ne créent aucune allocation d'oracle. Une mémoire
contradictoire produit deux réfutations et aucune acceptation. Un faux
verdict est réfuté par les deux processus. Rapport modifié, expiration et
source rétractée sont refusés. L'inspection expose le domaine mémoire et la
fraîcheur actuelle. La suite native subset sum reste exécutée en régression.

## Limites

Le domaine reste la copie textuelle des mémoires de promotion `Experience`
sans contexte interprétatif. La fidélité ne prouve ni la vérité source ni
l'utilité cognitive. Le batch direct AEIS conserve son budget local ; seule
la méthode de run bénéficie de la réservation durable et de la clôture.

Les deux stratégies partagent Node et les contrôles de faits ; l'indépendance
n'est pas une indépendance complète d'implémentation ou d'environnement.
Le coût local en dollars demeure inconnu. Le confinement OS, les oracles code,
les autres formats et magasins, la propagation générale et les campagnes
représentatives avec reproduction indépendante restent ouverts.
La conservation exhaustive des coûts lors d'une exception après lancement
reste à qualifier ; la réservation consommée ne doit pas être assimilée à
un décompte complet des processus observés.

Les attestations antérieures à ce registre de domaines gardent leur lecture
historique. La nouvelle liaison de sujet et l'empreinte d'implémentation
peuvent refuser leur réutilisation actuelle ; il faut lancer un nouveau run,
sans convertir silencieusement une preuve historique en preuve fraîche.
Les 115 obligations P1 et les six lots ne sont pas clôturés.
