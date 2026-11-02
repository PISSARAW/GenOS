# ADR — Campagne native AGOW appariée

- **Statut** : Accepté pour une qualification locale bornée
- **Date** : 2026-11-02
- **Domaine** : AGOW, protocole expérimental, état initial et couverture
- **Lié à** : [ADR 0769](0769-refutations-natives-mesurees-par-agow.md)

## Contexte

Les observations natives distinguent les pertes vérifiées et les inconnus.
Le banc de réfutation contrôlée ne compare pas deux politiques. Avant une
campagne sur tâches cachées, les conditions exécutées doivent être reliées à
des états initiaux, entrées et plafonds communs, avec une couverture explicite.

## Décision

Ajouter un banc sous `benchmarks/agow-paired-native/`. Il prépare une base SQLite
fermée par tâche, puis la copie pour chaque condition. Le manifeste précède
l'exécution et fixe `shadow`, `bounded`, méthodes, plafonds et hashes des bases,
entrées et sources importantes. Les bras utilisent des processus, bases et
capsules propres. L'ordre est inversé entre les deux tâches déclarées.

Chaque bras relit son véritable run, son autorité et sa liaison d'observation.
Une perte numérique exige la revalidation native et du hash de mesure. Le mode
effectif doit correspondre à l'autorité de contrôle enregistrée. Les plafonds
et la méthode sont recoupés avec le manifeste. Les coûts proviennent du journal
scellé d'exécution des oracles.

Le hash du manifeste et le créneau du bras sont inscrits dans l'objectif du
contrat worker scellé. Le lecteur exige ce lien et recoupe le sujet courant avec
le hash de l'attestation native, y compris pour un résultat inconclusif. Ces
métadonnées de provenance modifient le texte de l'objectif entre bras ; les
paramètres du calcul `subset_sum` restent communs. Le protocole ne qualifie pas
l'aveuglement d'une politique à son étiquette de condition.

Le vérificateur recalcule les résultats depuis des copies des bases, contrôle
sources et fichiers initiaux, puis recalcule l'analyse. Il refuse les chemins
hors de la racine, les liens symboliques de base et les journaux SQLite non
checkpointés. Les bases originales ne sont pas ouvertes pour cette relecture.

L'analyse exige exactement un résultat par créneau prévu, sans réutilisation
de run. Les pertes inconnues et coûts incomplets restent explicites. Les bornes
de différence de perte sont arithmétiques ; aucune promotion n'est autorisée.

## Conséquences

### Intégration au protocole EVIDENCE des missions

Le contrôle public de complétion continue de refuser une assemblée native non
acceptée. L'enregistrement transactionnel reconnaît uniquement ce refus précis
pour un événement portant une référence d'oracle natif. Il laisse alors le gate
natif enregistrer son terminal canonique, puis exige un run `blocked`, le motif
`ORACLE_ASSEMBLY_NOT_ACCEPTED`, un arrêt explicite et un reçu biologique du même
worker et run avec `verified: false`. L'autorité est revalidée avant et après.
Tout autre résultat est rejeté et la transaction annulée. Aucun dossier EVIDENCE
accepté n'est produit par ce chemin.

Ce raccord conserve les refus comme observations natives ; la mesure de perte 1
exige toujours les deux réfutations signées du lecteur AGOW. Un inconclusif reste
inconnu. Les tests refusent une complétion simulée, un autre motif de blocage ou
un reçu biologique positif à la sortie de ce chemin.

- Les états SQLite initiaux sont identiques octet pour octet dans chaque paire.
- Les plafonds communs ne supposent pas des consommations égales.
- Les coûts d'oracle ne représentent pas le coût complet du runtime.
- Les fixtures sont connues et déterministes. Le résultat qualifie le dispositif
  d'appariement et ses refus, sans efficacité généralisable.
- La fraîcheur et les autorités natives continuent de borner la relecture.
- Un échec du driver interrompt la campagne sans retirer un bras du bilan.
- Les tâches cachées, réplications indépendantes, randomisation et contrôle
  d'autres états initiaux restent nécessaires à une campagne d'efficacité.

## Alternatives

- Comparer les cas du banc de fautes : entrées et intervention différentes.
- Partager une base vivante entre modes : l'état acquis contamine le second bras.
- Imputer une perte à l'inconclusif : preuve sémantique insuffisante.
- Lire seulement le fichier principal avec un WAL non vide : état incomplet.

## Vérification

`npm --prefix backend run test:agow:paired` couvre les contrats, quatre missions
natives, les preuves et sept falsifications d'archive. Les tests de contrat
rejoignent aussi la suite de métacognition de `npm test`.
