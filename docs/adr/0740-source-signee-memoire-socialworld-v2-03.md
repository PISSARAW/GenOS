# ADR 0740 — Source signée et indépendante pour la mémoire SocialWorld V2-03

- **Date** : 2026-10-24
- **Statut** : Accepté
- **Domaine** : SocialWorld, mémoire durable, provenance, vérification
- **Décideurs** : GenOS maintainers
- **Lié à** : [ADR 0739](0739-envois-idempotents-apres-reprise-sociale.md)

## Contexte

Le runner V2-03 écrivait cinq épisodes produits par lui-même. Après redémarrage,
il les rappelait correctement, mais aucun événement d'origine n'était authentifié.
L'oracle exigeait en outre une liaison à des reçus vérifiés qui n'était jamais
alimentée. Les vingt graines de la campagne partielle sont donc restées
inconclusives.

## Décision

Un processus source publie cinq faits par le service d'organisation, conserve sa
base SQLite et extrait les messages effectivement livrés dans l'inbox avec une
intégrité vérifiée. Un deuxième processus relit la base source et les artefacts,
puis signe les reçus avec une clé privée Ed25519 absente du runner mémoire et du
dépôt. La clé publique et son empreinte sont épinglées dans un fichier de confiance
distinct du lot source.

Le runner mémoire accepte aussi un lot équivalent fourni par une autre source
autorisée. Il vérifie l'émetteur, la graine, le destinataire, le domaine, les
signatures, l'unicité des événements et le hash de chaque artefact. Il copie les
preuves dans son dossier, crée la relation et les épisodes à partir des seuls
reçus admis, ferme SQLite, puis relit et revérifie la source dans un nouveau
processus. Un autre processus ouvre une base neuve pour le contrôle négatif.

Le statut `pass` exige la relation persistée, les cinq reçus liés aux épisodes,
la modification de la décision différée et l'absence de relation, souvenir et
leçon dans le contrôle négatif. Sans source signée, le diagnostic reste
`inconclusive`.

## Conséquences

- Positives : le runner ne peut plus promouvoir des épisodes qu'il a lui-même
  inventés; les signatures et artefacts restent inspectables après le run.
- Négatives : la campagne exige un producteur, un vérificateur, une clé privée
  protégée et une clé publique épinglée avant exécution.
- La source locale qualifie la persistance et le rappel d'événements logiciels
  réellement livrés. Sa signature ne prouve pas une vérité extérieure au runtime,
  ni l'utilité sociale de l'échange.

## Alternatives

- Ajouter seulement des booléens `verified` aux épisodes : rejeté, car le runner
  pourrait s'auto-attester.
- Signer les épisodes dans le processus mémoire : rejeté, car le producteur et le
  vérificateur seraient identiques.
- Retirer le contrôle de reçus de l'oracle : rejeté, car la campagne annoncerait
  un succès sans provenance indépendante.

## Validation

`test-run-v2-03-source.cjs` exécute la publication, la vérification dans un
autre processus, la signature et le redémarrage de la mémoire. Le test de
signature vérifie aussi le rejet d'un artefact modifié. Les rapports de campagne
doivent conserver le lot, la clé publique, les artefacts et leurs empreintes.
