# ADR 0281 — Preuves résolvables ou rien (scoring Trinity anti-fabrication)

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Trinity, scoring, barrière comparative, preuves
- **Décideurs** : GenOS
- **Lié à** : ADR 0279, ADR 0280, campagne Trinity réelle du 03/10/2026

## Contexte

La campagne réelle a montré des mondes citant `evidence1`, `<source-ref>`,
`https://example.com/ref1`, `README`, voire le texte de la mission comme
« preuves », et des listes `tests: ["vérifié"]` comptées comme couverture à
100 %. Cause : `evidenceWeightOf` comptait toute chaîne non vide,
`isSubstantiveClaim` toute phrase ≥ 20 caractères, `passedTests` toute
chaîne sans « fail ». Le service lourd `trinityClaimVerificationService`
(workspace isolé, 120 s) n'est jamais invoqué sur ce chemin et ne convient
pas aux dossiers de raisonnement sans commandes. La matrice de comparaison
rendait `strengths: [], weaknesses: []` : le gate refusait sans expliquer.

## Décision

1. Nouveau module `trinityEvidenceAudit` : une référence ne pèse que si elle
   est résolvable — id présent dans `evidence[]` du dossier (poids 2), URL
   vérifiable de forme hors `example.*` ou chemin repo (poids 1). Placeholders,
   déclarations nues et auto-citations du texte de mission pèsent zéro.
2. `passedTests` : seules les entrées objets avec reçu (`receipt`,
   `commandId`, `hash`, `output`, `exitCode`, `durationMs`) et sans échec
   comptent. Les chaînes déclaratives ne comptent jamais.
3. `scoreWorldEvidence` attache `evidenceAudit` et ne prouve (`provenClaims`)
   qu'à poids ≥ 1 ; la matrice de comparaison remplit `strengths` /
   `weaknesses` depuis l'audit au lieu de tableaux vides.
4. Le test `test_trinity_comparative_merge` est mis au nouveau contrat
   (l'ancien contrat notait la fabrication : `claimsScore 0.5` pour
   `evidence: ['test passed']`, couverture 1.0 pour des chaînes).

## Conséquences

### Positives

- Rejoué sur les 18 dossiers réels : aucun ne passe le seuil 0.70, les
  dossiers à placeholders seuls prouvent zéro, chaque fabrication est nommée
  dans la matrice.
- Un dossier à vraies références résolvables et tests avec reçus score haut
  (pas de mise à zéro aveugle).

### Limites assumées

- Une URL de forme valide mais jamais récupérée pèse 1 : locator, pas
  preuve vérifiée. Récupération/vérification réseau : suivi requis.
- La vérification lourde par workspace reste réservée aux missions code avec
  commandes ; aucun pont entre les deux à ce stade.

## Preuves exigées

- Test `backend/tests/test_trinity_evidence_audit.js` : placeholders à zéro,
  auto-citations à zéro, résolvables pesés, tests déclaratifs à zéro,
  matrice explicative, rejouabilité des 18 dossiers, bon dossier noté haut.
