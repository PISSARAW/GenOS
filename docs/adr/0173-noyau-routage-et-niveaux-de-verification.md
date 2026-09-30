# ADR 0173 — Noyau de routage et niveaux de vérification des claims

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Épistémologie, vérificateurs, reçus
- **Lié à** : ADR 0019, ADR 0021b, ADR 0030

## Contexte

GenOS possède déjà des claims typés, des adaptateurs de vérification et des
reçus signés. Il manquait un contrat commun pour exprimer le niveau épistémique
d'un claim à partir de reçus réellement valides, indépendants et liés à son
identité et à son empreinte de preuve. La présence d'un artefact ou l'avis du
générateur ne doit pas attribuer ce niveau.

## Décision

Le `verificationKernel` classe un claim à partir des reçus signés vérifiables
avec la liste des vérificateurs de confiance, puis exige la concordance de
`resultId` et `evidenceDigest`. Les profils de vérificateur sont fournis par la
configuration appelante : preuve formelle, contrôle déterministe, expérience ou
source. Un échec signé lié au claim le classe `REFUTED`. Un reçu absent, non
fiable, invalide ou mal lié ne donne jamais un niveau vérifié.

Le noyau expose `PROVEN`, `VERIFIED`, `EMPIRICALLY_VERIFIED`, `SOURCE_SUPPORTED`,
`CORROBORATED`, `PLAUSIBLE`, `SPECULATIVE`, `REFUTED` et `UNVERIFIED`. La sortie
ne rend jamais un claim éligible à la promotion ; les gates existantes restent
l'autorité de promotion. L'extraction des claims depuis une réponse libre et
l'exécution des solveurs restent des responsabilités distinctes.

## Conséquences

- Les intégrateurs doivent fournir des digests de vérificateurs de confiance et
  leurs profils, ainsi que les reçus associés au claim.
- Les reçus signés mais non indépendants sont visibles comme plausibles, sans
  recevoir un statut vérifié.
- Le noyau classe la qualité du mécanisme déclaré ; il ne prouve pas que le
  domaine, les hypothèses ou le protocole choisi sont appropriés.
