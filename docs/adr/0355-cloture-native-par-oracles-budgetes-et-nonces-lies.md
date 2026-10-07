# ADR 0355 — Clôture native par oracles budgétés et nonces liés

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : P1 L01, L02, L03 et L22, runtime, AEIS, promotion

## Contexte

L'ADR 0354 produit deux receipts sémantiques, mais le parcours natif reste
bloqué au gate terminal. La simple présence d'une signature ne lie ni une
réservation de budget ni la décision courante. Une promotion différée doit
conserver l'approbation humaine et la fraîcheur des preuves après reprise.

## Décision

Les nouveaux contrats réservent au plus deux exécutions de vérificateur et
10 000 ms. Le budget du run réduit ce plafond ; une demande peut seulement
le réduire davantage. Le run, son binding et son enveloppe scellent ces
limites. Les budgets des étapes conservent leurs quantités numériques.

Après publication de l'observation `EVIDENCE_REPORT`, le coordinateur natif
réserve les deux exécutions dans une transaction du journal GVX existant.
L'identité de réservation est unique par run et n'est pas renouvelable. Les
deux algorithmes de l'ADR 0354 partagent une échéance absolue. Chaque receipt
signé lie l'observation, les bindings et le hash de la réservation. Le coût
de durée attesté doit être égal à la somme des durées signées des processus.

Le coordinateur conserve l'assemblée dans `aeis_assurance_assemblies`, puis
scelle une attestation GVX liée au run, au tenant, au rapport, à l'autorité,
au budget et à la fraîcheur. L'événement terminal transmet uniquement sa
référence. Le service charge les preuves et contrôle leurs liens ; il ne
déduit pas leur validité des booléens d'un candidat. Le gate de promotion
existant reste obligatoire. Un quorum inconclusif bloque le run.

L'acceptation terminale et la consommation des deux nonces se font dans la
transaction de progression du run. L'acceptation conserve l'événement et
le temps de décision. Si le contrat impose une approbation humaine, le run
reste `awaiting_approval`. Le parcours `approveRun` charge le rapport appliqué,
revalide la preuve actuelle et exige la preuve humaine habituelle. Il peut
réutiliser seulement les nonces déjà consommés par cette même acceptation,
avec receipts identiques. Les reprises et chaque phase de promotion native
recontrôlent la fraîcheur et l'autorité avant les effets.

Le reçu biologique conserve le lien d'acceptation et un contrôle du budget
des oracles. La durée du worker inclut déjà l'attente des oracles ; les durées
de leurs processus constituent une mesure séparée et ne sont pas additionnées
une seconde fois. Jetons modèle et facturation fournisseur des oracles sont
nuls ; `localComputeUsd: null` signifie que le coût local n'est pas mesuré.

L'inspection des consommateurs et des receipts de manifeste expose une
décision historique et un contrôle courant distincts, avec domaine et coûts.
Une preuve expirée ne réécrit pas la décision historique. Cette vue ne délivre
aucune autorisation de promotion et ne valide pas les claims scientifiques
du manifeste.

## Vérification exécutable

`test_native_oracle_completion.js` utilise les migrations complètes, une
capsule réelle et le runtime natif. Il vérifie la clôture positive sous les
gates par défaut, l'approbation humaine séparée, les références modifiées,
le propriétaire, le rapport changé, le replay et l'expiration. Une seconde
connexion attend une réservation réellement en cours ; elle n'obtient pas
une seconde allocation. Un nouveau processus retrouve l'attestation.

Un contrat plus restrictif refuse de lancer les oracles. Une demande qui
augmente son grant est rejetée. Le parcours réel à vingt et une valeurs
conserve le verdict inconclusif de l'énumération et bloque la clôture. La
sonde historique sans clé AEIS conserve son refus de preuve indépendante.
Les sondes sont intégrées à `npm test`.

## Limites

Le domaine reste le subset sum natif borné de l'ADR 0354. Les autres méthodes,
les oracles code et mémoire et les dépendances communes de Node ne sont pas
qualifiés. Les processus frais n'établissent pas un confinement OS.

La réservation est conservatrice : un crash avant l'attestation laisse les
exécutions allouées et exige une nouvelle tentative sous un nouveau run.
Elle ne prouve pas une exécution de processus exactement une fois ni une
reprise transparente à tout point de crash. Sans clé de signature ou sans
grant natif, les gates existants restent applicables et aucune preuve native
positive n'est fabriquée. Les fronts directs, la synchronisation externe,
les holdouts, les interventions causales et les pilotes complets restent
à qualifier. Aucun des six lots complets de P1 n'est clôturé.
