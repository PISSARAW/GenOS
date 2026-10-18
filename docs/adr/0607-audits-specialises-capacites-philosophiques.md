# ADR 0607 — Audits spécialisés des capacités philosophiques

- Statut : Accepté
- Date : 2026-10-18
- Domaine : philosophie opérationnelle, identité, causalité, biomimétisme
- Décideurs : mainteneurs GenOS
- Lié à : [ADR 0326](0326-audits-philosophiques-executables-et-preuves.md), [ADR 0605](0605-dispositions-implementation-philosophique.md)

## Contexte

Les 420 contrats disposent d'une sonde bornée. Les trois concepts classés
`runtime-capability` restaient toutefois évalués par des prédicats génériques :
présence d'une identité ou simple différence entre deux valeurs. Ces critères
ne suffisent pas pour vérifier leurs invariants logiciels propres.

## Décision

Introduire trois évaluateurs déterministes et versionnés :

- `identity-continuity` exige identité et lignée stables ainsi qu'une révision
  exactement consécutive ;
- `measured-intervention` exige contrôle et traitement mesurés, conditions
  comparables, preuves distinctes et delta non nul ;
- `controlled-biomimetic-effect` exige hypothèse préenregistrée, répétitions
  comparables, seuil positif et effet moyen atteignant ce seuil.

Le contrat publie l'évaluateur et ses sorties dans `specializedMechanism`.
La validation échoue si l'identifiant, le champ, le prédicat ou les limites
d'autorité divergent du registre. Les expériences existantes utilisent des
fixtures structurées satisfaisantes et falsifiantes pour ces évaluateurs.

Ces audits calculent des propriétés des observations fournies. Ils conservent
`externalFactsVerified: false`, `runtimeAuthorityGranted: false` et
`promotionEligible: false`.

## Conséquences

### Positives

- Les trois capacités runtime ne reposent plus sur une présence ou différence brute.
- Les reçus exposent les deltas et contrôles effectivement calculés.
- Une altération du mécanisme invalide l'empreinte et le replay du contrat.

### Négatives

- Les mesures et empreintes restent déclarées par le producteur.
- Le seuil biomimétique n'est pas un test statistique de significativité.
- La validation indépendante sur mission réelle reste une phase ultérieure.

## Alternatives

- Conserver les prédicats génériques : rejeté, car ils sous-spécifient les invariants.
- Autoriser les services métier à auto-attester leurs résultats : rejeté, faute
  d'indépendance et de chaîne d'autorité reconnue.
