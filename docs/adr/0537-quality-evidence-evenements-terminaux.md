# ADR 0537 — Preuve de qualité signée sur les événements terminaux

**Statut** : Accepté  
**Date** : 2026-10-15  
**Domaine** : exécution, épistémologie, apprentissage causal  
**Décideurs** : équipe GenOS  
**Lié à** : ADR 0535a (reprise idempotente de l’apprentissage causal)

## Contexte

Les événements `AGENT_COMPLETED` ne transportent pas systématiquement une preuve
`qualityEvidence`. Une référence `nativeOracleRef` identifie une attestation, mais
ne constitue pas à elle seule une preuve de qualité liée à l’action. Le pont causal
refuse donc correctement ces résultats, même quand le quorum de vérification natif
a été accepté.

## Décision

À l’entrée des événements terminaux de runs worker, le runtime retire toute preuve
`qualityEvidence` fournie par l’appelant. Pour `AGENT_COMPLETED`, il demande au
`nativeOracleGate` de relire et vérifier le quorum accepté, puis émet une preuve de
qualité liée au run, à l’agent et à son périmètre organisation/projet. Le reçu signé
du type de vérificateur `native_oracle_quality` lie aussi le hash de l’attestation et
les identifiants des reçus indépendants sources. La valeur `1` signifie uniquement
que le quorum natif a accepté le résultat; elle n’est pas une note générale de
qualité.

Les autres événements terminaux portent `qualityEvidenceStatus: unavailable` avec
une raison explicite. Une abstention, un échec ou un oracle absent ne produit pas de
score signé. Les contrats de validation et d’apprentissage existants restent
fail-closed.

## Conséquences

### Positives

- Les résultats worker dont l’oracle est accepté peuvent alimenter la boucle
  causale avec une preuve vérifiable et liée au run.
- Les preuves fournies par le worker ne sont jamais promues en preuve de qualité.
- L’absence de preuve devient observable et conserve l’abstention pour les cas sans
  mesure indépendante.

### Négatives

- La preuve synthétisée ne couvre que le verdict binaire du quorum natif, pas une
  métrique métier universelle.
- Les événements hors runs worker ou sans attestation acceptée restent non scorés.

## Alternatives

- Dériver un score du statut `AGENT_COMPLETED` : rejeté, car un statut terminal ne
  prouve pas la qualité.
- Réutiliser directement un reçu de vérificateur : rejeté, car ce reçu signe un
  autre résultat/digest et ne lie pas le score au run et au périmètre causal.
