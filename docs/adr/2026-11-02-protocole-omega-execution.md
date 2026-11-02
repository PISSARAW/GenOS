# ADR — Protocole OMEGA Execution v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : G-CIR Ω, admission, obligations, effets et reprise
- **Références** : [Contrat](../03-reference/protocole-omega-execution.md),
  [Admission](../03-reference/omega-admission.md),
  [Codec Rust/Node existant](0322-interop-gcir-omega-rust-node.md)

## Contexte

Le dépôt possède déjà le format canonique `genos.gcir.omega/v1`, son codec
MessagePack et un interpréteur Node avec registre d'obligations. Un transport
réussi ou un programme décodable ne prouve ni la disponibilité d'une capacité,
ni l'exécution d'une vérification, ni l'autorisation d'un effet externe.

Une opération dont l'issue est inconnue après déconnexion ne peut pas être
déclarée échouée ou répétée automatiquement sans garantie de reprise.

## Décision

Introduire le profil `genos.omega.execution/v1`, distinct du format du programme.
Le programme reste validé et lu par le vrai service d'interopérabilité existant ;
son empreinte est celle de son encodage MessagePack, sans imitation par un hash
JSON. L'enveloppe et les autres engagements réutilisent la canonicalisation
EVIDENCE.

Admettre le programme dans un plan lié à sa politique native, aux capacités
effectives, au domaine, à l'environnement, à la base, au budget et au contexte
d'autorité. Toutes ses opérations restent des obligations ouvertes à l'entrée.
Une capacité annoncée indique une disponibilité ; elle ne remplace pas la
permission native du programme ou l'autorisation du récepteur.

Le payload du programme contient uniquement des requêtes bornées par opération.
Les handlers, vérificateurs, résultats et reçus proviennent du runtime installé
et des vérificateurs de confiance, jamais d'une fonction ou d'un résultat
préfabriqué transmis par le demandeur.

Séparer admission, exécution durable et autorisation des effets. Les références
aux reçus ne constituent pas elles-mêmes une vérification. Un effet externe
exige sa propre décision liée au candidat exact, puis un reçu appliqué ou une
réconciliation explicite si son issue est inconnue.

## Conséquences

- Une obligation ne peut pas être omise d'un plan accepté.
- Une opération disponible mais absente de `program.policy` demeure refusée.
- Une nouvelle génération de runtime ou un changement d'objet invalide
  l'applicabilité du plan antérieur sans l'effacer du journal.
- Une réserve budgétaire n'est pas dépensable implicitement par une opération.
- Les garanties d'effet dépendent de l'adaptateur réellement installé ; un
  callback arbitraire ne fournit pas à lui seul idempotence et fencing.
- Le nouveau profil ne rend pas automatiquement tous les programmes du codec
  historique exécutables par un service distant ni par l'implémentation Rust.

## Alternatives

- Transporter une commande shell ou un objet de handlers : rejeté, car cela
  contournerait le registre et les gates du runtime.
- Accepter un programme parce que MessagePack est décodable : rejeté, car la
  validation de transport ne prouve pas les capacités ni les permissions.
- Considérer une approbation humaine comme un test : rejeté, car autorisation,
  vérification et application sont des étapes différentes.
- Rejouer aveuglément un effet après timeout : rejeté, car son issue peut déjà
  être appliquée à la ressource.
