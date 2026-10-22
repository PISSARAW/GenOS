# ADR 0721 — Digital Evidence Organ (DEO) : ingestion, normalisation et intégrité des preuves numériques

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : épistémologie, preuves numériques, DFIR, conformité, provenance
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0029, ADR 0173, ADR 0649, ADR 0651 ; [Épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md)

## Contexte

Les investigations de sécurité et d'infrastructure reposent sur des artefacts hétérogènes : journaux Windows EVTX, scans réseau XML Nmap, chronologies d'alertes CSV Hayabusa, rapports de stratégies de groupe (GPO) et sorties d'évaluation de politiques Conftest.

Un simple parsing permissif risque de :
- modifier ou perdre l'artefact brut d'origine ;
- promouvoir silencieusement un export tronqué, un fichier corrompu ou une source falsifiée ;
- masquer des contradictions d'horodatage ou de posture en inventant une conclusion synthétique.

## Décision

Nous introduisons le **Digital Evidence Organ (DEO)** dans `backend/src/services/digitalEvidenceOrgan/` (exposé via `digitalEvidenceOrganService.js`), structuré en sept composants :

1. **`EvidenceIngestion` (`evidenceIngestion.js`)** : importe les 5 formats (`evtx`, `nmap_xml`, `hayabusa_csv`, `gpo_report`, `conftest`), vérifie la complétude structurelle et fige les octets bruts (`rawBytes`) ainsi que leur empreinte `sha256` sans aucune altération. Les EVTX binaires sont décodés par `wevtutil.exe` sur Windows ; ailleurs, ils sont explicitement rejetés tant qu'aucun parseur binaire n'est disponible.
2. **`EvidenceNormalizer` (`evidenceNormalizer.js`)** : convertit les enregistrements en observations canoniques typées (`genos.deo-observation/v1`), déduplique les événements identiques et rejette explicitement tout événement ou niveau inconnu (`DEO_UNKNOWN_EVENT`).
3. **`EvidenceProvenance` (`evidenceProvenance.js`)** : exige un registre non vide de collecteurs approuvés et une clé HMAC-SHA256 pour authentifier chaque artefact (`DEO_FORGED_SOURCE` en cas d'absence ou d'échec), puis chaîne chaque observation dans une chaîne de hachage `sha256-parent-v1` liée à l'artefact brut et au contexte opérationnel.
4. **`EvidenceCorrelator` (`evidenceCorrelator.js`)** : relie les observations partageant un hôte (`host`), un utilisateur (`user`), un processus (`process`) ou une fenêtre temporelle (`period`).
5. **`EvidenceIntegrityVerifier` (`evidenceIntegrityVerifier.js`)** : recalcule les empreintes des artefacts bruts, des observations normalisées et des reçus de provenance Merkle pour détecter toute altération ou preuve manquante (`DEO_MISSING_EVIDENCE`, `DEO_OBSERVATION_TAMPERED`, `DEO_PROVENANCE_TAMPERED`).
6. **`EvidenceConflictResolver` (`evidenceConflictResolver.js`)** : détecte les horodatages contradictoires, les inversions temporelles (événement postérieur à la collecte) et les postures GPO contradictoires. Il conserve les deux versions sous le statut `suspended_judgment` avec `inventedConclusion: null`.
7. **`EvidenceRetention` (`evidenceRetention.js`)** : applique les paliers de rétention (`ephemeral`, `short_term`, `standard`, `forensic_hold`), la minimisation par pseudonymisation déterministe (`redacted:sha256...`) et la révocation explicite par artefact, observation ou collecteur.

## Format interne et interopérabilité

- Le coffre brut (`rawVault`) conserve les octets exacts d'origine.
- Le format interne binaire (`binaryFrame`) utilise une trame MessagePack signée par l'en-tête magique `GDEO` et un condensat SHA-256 (`encodeTypedBinary` / `decodeTypedBinary`).
- L'export standard (`standardExport`, schéma `genos.deo-dossier/v1`) demeure intégralement sérialisable en JSON canonique interopérable.
- Conformément à la règle fondamentale de GenOS, `promotionEligible` et `authorizesPromotion` restent à `false` : l'ingestion et la corrélation ne remplacent jamais les portes de promotion ni un oracle indépendant.

## Conséquences et validation

- `backend/tests/test_digital_evidence_organ.js` valide les 5 formats, les 7 cas de tests obligatoires (fichiers corrompus, événements dupliqués, horodatages contradictoires, export incomplet, preuve manquante, source falsifiée, événement inconnu) ainsi que le critère de validation à 100 % sur un corpus d'essai scellé. Le fixture EVTX du corpus est un export XML ; le décodage d'un EVTX binaire valide requiert une qualification sur un fixture réel Windows.
