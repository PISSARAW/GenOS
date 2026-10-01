# Nursery expérimentale GVX

`backend/src/services/gvxExperimentalNursery.js` connecte le protocole GVX à quatre
adaptateurs fournis par l'hôte : monde isolé, exécution de monde, lecture des artefacts et
registre de vérificateurs issus de `verifierTrustRegistry` via
`gvxVerifierRegistry.fromTrustedRegistry`. Les contrôles du
plan (snapshot, modèle, outils, environnement, bras et budgets) restent ceux de
`gvxExperimentProtocol`.

Pour chaque preuve, la nursery lit l'artefact et calcule son SHA-256; elle invoque seulement
un vérificateur enregistré pour le requirement correspondant. Les noms de vérificateurs et
hashes de l'outcome candidat n'ont aucune autorité par eux-mêmes. L'identifiant d'isolation
du monde retourné doit correspondre au bras planifié.

Après vérification, les reçus indépendants sont évalués par le protocole existant et les
événements de début et de fin sont conservés dans le ledger GVX. Le résultat ne permet pas
la promotion. La nursery ne garantit pas à elle seule que l'adaptateur d'hôte fournit une
isolation système réelle; cet invariant doit être assuré par la plateforme d'exécution.

Voir [ADR 0263](../adr/0263-nursery-experimentale-gvx.md).
