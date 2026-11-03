# GQWF pour les artefacts textuels Rust

Le parcours LLM utilise le CAS SQLite natif et sa comparaison atomique de tête.
Il transporte un artefact textuel réel, sans dépendance au résultat
`integer_sum`. Les espaces de noms producteur et coordinateur sont distincts
et liés à l'incarnation ; aucun transfert réseau de CAS n'est revendiqué.

L'offre contient cinq objets disponibles et rehashés : le bundle source admis,
le payload canonique appliqué au producteur, les octets UTF-8 de la réponse,
le reçu natif contenant aussi les octets HTTP bruts et la fermeture d'exécution.
La fermeture lie la source, l'entrée, le résultat, la méthode, le contrat,
la base et sa génération, la politique, l'environnement et l'observation.
L'origine reste `model_generated` pendant tout le parcours.

Recevoir ces objets ne vaut pas acceptation d'une preuve. `verify` exige le
reçu EVIDENCE courant sur le sujet exact. Les deux méthodes locales relisent
leurs contextes adressés, le texte, le contrat et les identités installées.
Elles vérifient les contraintes structurelles installées ; elles ne démontrent
pas la vérité générale de la prose ni un consensus de modèles indépendants.

`prepare` revalide les objets, les preuves et la base, exige un usage connu
sans dépassement, puis prépare l'intention OMEGA d'émission. `commit` répète les
contrôles dans la transaction autoritative, compare l'ancienne tête et sa
génération, puis inscrit ensemble la nouvelle tête, le reçu OMEGA, le reçu de
publication et le statut SQL `completed`. Un échec d'écriture annule l'ensemble.
Une branche préparée sur une ancienne génération doit être réévaluée.

Un résultat authentique mais tronqué, non conforme, sémantiquement non résolu,
ou dont l'usage reste inconnu peut demeurer conservé comme candidat. Il ne
devient pas une publication qualifiée en ajoutant un booléen de succès.
Le reçu de publication indique toujours `artifact_contract_verified`, avec
`semantic_truth_verified: false`, `promotable: false` et
`external_effects_authorized: false`.

La reprise d'une observation connue utilise `offer_observed`. Cette API exige
une preuve opaque recomputée à partir du journal attesté, du contexte courant
et du contrat admis. Elle relit les octets observés dans SQLite ; elle ne
désérialise pas un JSON client en fausse `ModelObservation` et ne relance pas
le fournisseur. Le rejeu d'une publication retourne son reçu historique après
revalidation, sans réappliquer la tête.

Le stockage local et l'installation restent de confiance opérateur. Une
ancienne copie du journal n'est pas une autorité de production. Les preuves
structurelles n'autorisent ni déploiement, ni paiement, ni autre effet métier.

Les tests `llm_gqwf` couvrent les échanges HTTP de qualification, le rollback
après une mise à jour de tête, deux branches préparées sur la même base,
la corruption du CAS, l'usage inconnu et la reprise sans nouvel appel.
