# ADR 0725 — Vérification Claim-to-Evidence et prévention des sophismes d'observation

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : cybersécurité, preuves, épistémologie opérationnelle, traçabilité
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0613, ADR 0721, ADR 0724

## Contexte

Un rapport de cybersécurité ne doit jamais affirmer un constat technique sans
observations vérifiables, ni dériver une conclusion négative universelle à
partir d'un silence de capteur (« aucun événement observé » → « aucune
attaque ») ou d'une intégrité statique (« fichier inchangé » → « fichier jamais
consulté »).

## Décision

`scripts/claim-to-evidence/claimEvidenceVerifier.js` et son interface CLI
`scripts/claim-to-evidence/cli.cjs` implémentent le moteur **Claim-to-Evidence
Verification (Chantier 5)** :

1. **Liaison obligatoire aux observations** : chaque affirmation factuelle
   (`claim`, `finding`, `assertion`) doit référencer une ou plusieurs preuves
   significatives présentes dans le magasin de preuves (`evidence-store/`) et
   couvrir toutes ses preuves attendues (`expectedEvidence`).
2. **Exemple canonique — fermeture de l'exception réseau** :
   - *Constat* : les quatre ports testés (`22, 80, 443, 3389`) sont passés de
     l'état `open` à l'état `filtered` après suppression des règles temporaires.
   - *Preuves vérifiées* : export Nmap autorisé (`nmap-export-avant.json`),
     export Nmap rebloqué (`nmap-export-apres.json`), rapport Ndiff
     (`ndiff-rapport.txt`), retrait de règle pfSense (`pfsense-rule-removal.log`)
     et vérification croisée de correspondance des cibles (`verifyTargetCorrespondence`).
   - *Limite explicite* : la mesure ne démontre pas à elle seule l'absence
     d'autres chemins réseau.
3. **Détection des modifications artificielles des sources** :
   `checkEvidenceIntegrity` et `verifyArtifactSemantics` contrôlent l'empreinte
   SHA-256 et la cohérence interne des sources (états des ports Nmap, transitions
   Ndiff, règles pfSense et correspondance des IP cibles). Toute altération
   artificielle d'une source provoque un échec de vérification (`source_tampered`
   ou `hash_mismatch`).
4. **Blocage des sophismes épistémiques** (`detectFallacy`) :
   - `absence_of_event_to_no_attack` : interdit de transformer « aucun événement
     observé » en « aucune attaque » ;
   - `unchanged_file_to_never_accessed` : interdit de transformer « fichier
     inchangé » en « fichier jamais consulté ».

## Validation

- `node scripts/claim-to-evidence/test_claim_evidence.js` vérifie la traçabilité
  intégrale du corpus de référence (`reference-corpus/`), le signalement des
  preuves manquantes, la détection des sophismes et l'échec immédiat en cas de
  modification artificielle des fichiers sources.
