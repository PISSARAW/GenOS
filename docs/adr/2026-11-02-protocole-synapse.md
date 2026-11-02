# ADR — Protocole SYNAPSE v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Communication compacte, dialectes, état partagé et accusés
- **Références** : [Contrat](../03-reference/protocole-synapse.md),
  [Contexte et codec](../03-reference/synapse-contexte.md)

## Contexte

GenOS possède des dialectes versionnés et un registre de connaissances communes.
Le hash natif du dialecte lie ses symboles et empreintes sémantiques, mais ne lie
pas leur `canonicalMeaning` ni leur `payloadSchema`. Deux runtimes pourraient
donc présenter le même hash tout en attribuant un sens différent à un symbole.

Une représentation compacte exige aussi une base, un schéma, une audience et
des dépendances communes. La livraison d'un message ne prouve ni son décodage,
ni son application, ni une action réelle ou une vérification indépendante.

## Décision

Introduire `genos.synapse/v1`, avec la conversation
`DECLARE_CONTEXT → OFFER_DELTA → REQUEST_MISSING → APPLY_DELTA → ACK_STATE`.
La demande n'est nécessaire que lorsqu'il manque une condition de compatibilité.

Le delta engage une base exacte, un contexte, un résultat et une liste
d'opérations canoniques. Sa représentation compacte ou canonique est séparée
de cet engagement. Une représentation de remplacement doit satisfaire le même
digest d'opérations ; elle ne peut pas changer le résultat demandé.

Le premier profil borne l'état à un objet JSON, avec des opérations `put` et
`remove`. Les schémas et leur correspondance aux opérations sont configurés
localement. Les symboles sont réellement encodés et décodés par les services
natifs, puis confrontés au snapshot complet du dictionnaire et à cette
configuration locale.

Une absence ou divergence du dialecte permet de demander une représentation
canonique. Celle-ci ne contourne jamais une base, un schéma, une audience, des
dépendances ou des connaissances communes devenus incompatibles. Une base
modifiée exige une nouvelle déclaration et une nouvelle offre explicitement
rebasée.

Conserver les histoires natives des connaissances communes sans exiger des
horodatages ou identifiants de preuve identiques entre deux bases indépendantes.
Comparer leurs bindings utiles : participants, domaine, empreinte, statut,
fraîcheur, confiance déclarée et contrat local de provenance.

## Conséquences

- Un hash natif identique ne suffit pas à admettre un dictionnaire.
- Un sens inconnu n'est pas deviné, même si le symbole semble familier.
- Le destinataire ne compile pas de schéma ou de décodeur distant.
- Les audiences de publication et les dépendances restent engagées explicitement.
- Les accusés `ACK_FACT` décrivent des dimensions distinctes ; aucun ordre
  d'acquisition ni implication automatique n'est introduit.
- Un accord opérationnel de sens ne prouve pas une compréhension mentale ou une
  indépendance statistique.
- Le sous-profil SYNAPSE/REFLEX n'est pas exécuté par cette première version.

## Alternatives

- Admettre le seul `commonGroundHash` natif : rejeté, car il omet le sens et le
  schéma des payloads.
- Remplacer le delta pendant le fallback : rejeté, car le résultat pourrait
  changer sous le même identifiant.
- Installer un schéma fourni dans le message : rejeté, car la configuration
  opérationnelle doit rester locale et autorisée.
- Considérer tout accusé comme une vérification réussie : rejeté, car transport,
  application, action, preuve et autorisation humaine sont distincts.
