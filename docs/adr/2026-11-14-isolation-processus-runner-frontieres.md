# Isolation du processus des frontières comportementales

- **Statut** : Accepté
- **Date** : 2026-11-14
- **Domaine** : sécurité, exécution locale, preuves de code
- **Décideurs** : équipe GenOS
- **Lié à** : `2026-11-05-frontieres-comportementales-generees-et-recues-hote.md`

## Contexte

Le runner de frontières charge du code proposé par un worker dans `node:vm`. Ce
contexte réduit les capacités visibles, mais Node.js ne présente pas `vm` comme une
frontière de sécurité. Le processus enfant existant possédait un délai global et une
sortie bornée, sans politique explicite de lecture seule ni plafond mémoire et pile.

## Décision

La commande scellée `.genos/boundary-check.cjs` est lancée directement par un
nouveau processus Node, sans shell. Le système de permissions de Node confine les
lectures au workspace, interdit toute écriture et refuse la création de processus et
de worker threads. Le processus reçoit un plafond V8 de 64 Mio, une pile de 512 Kio
et un délai total de 30 secondes. Le runner refuse de commencer si ces marqueurs et
options ne sont pas présents ou si son PID est celui de l'hôte.

La politique ne s'applique qu'à la commande de frontière scellée. Les tests visibles
gardent leur lanceur historique, car ils peuvent dépendre de leurs outils de build.
Le résultat et le reçu exposent la politique appliquée afin que la preuve ne déduise
pas l'isolation du seul succès du transport.

## Conséquences

### Positives

- une évasion du contexte `vm` reste limitée par les permissions du processus ;
- les écritures et créations de processus sont refusées par le runtime hôte ;
- mémoire, pile et temps sont bornés indépendamment des cas générés ;
- un test natif exerce réellement les refus et observe un PID distinct.

### Négatives

- le plafond V8 ne constitue pas un quota de mémoire résidente du système entier ;
- le système de permissions Node ne fournit pas de filtre réseau ; le runner ne
  reçoit toutefois aucune API réseau et ne peut charger de module par son contexte ;
- un runtime Node sans système de permissions fait échouer la frontière fermée.

## Alternatives

- **Conserver seulement `node:vm`** : rejeté, car ce module n'est pas une frontière
  de sécurité.
- **Imposer Docker à tous les hôtes** : rejeté pour ce chemin local, car Docker ne
  fait pas partie des prérequis et son daemon peut être absent.
- **Replier silencieusement sur l'ancien lancement** : rejeté, car une preuve ne doit
  pas annoncer une isolation qui n'a pas été appliquée.
