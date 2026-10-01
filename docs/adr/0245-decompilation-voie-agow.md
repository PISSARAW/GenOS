# ADR 0245 — Décompilation des voies automatiques AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, voies directes, prédiction et sécurité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0243, ADR 0244

## Contexte

Une voie directe devenue inadéquate peut masquer une dérive si elle reste active. Le
Signal Plane existant peut informer les organes, mais les routes consolidées doivent
être suspendues et le problème doit revenir dans AGOW.

## Décision

`decompilationService.recordOutcome` reçoit un outcome de voie et déclenche la remontée
si l'erreur de prédiction atteint 0,5, si l'environnement dérive, si l'issue est
inattendue, s'il y a contradiction, si le seuil de preuve monte ou si le contexte de
sécurité change. Il délègue la suspension au registre des voies, crée un candidat réel
`procedural_generated` via le routeur et persiste un reçu des causes et références.

Chaque outcome est aussi transmis au coordinateur de plasticité; un reçu rapporté ne
compte pas comme validation lente. L'admission du candidat ne prouve pas qu'une nouvelle
stratégie fonctionne.

## Conséquences

### Positives

- Une surprise observée ferme immédiatement la voie automatique avant la délibération.
- Le candidat de retour conserve l'origine procédurale et rejoint le pool AGOW.
- Le reçu permet d'auditer le motif, l'erreur et les preuves reliées.

### Négatives

- Le mécanisme ne détecte que les changements explicitement signalés par l'intégrateur.
- La suspension et l'admission dépendent du processus local et du Signal Plane existant.

## Alternatives

- Continuer d'utiliser la voie après un échec : rejeté, car l'erreur serait masquée.
- Décompiler sur chaque petit écart : rejeté afin de limiter les faux positifs et les
  oscillations; le seuil reste configurable dans le code après campagne.
