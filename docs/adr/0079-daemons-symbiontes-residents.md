# ADR 0079 — Daemons comme symbiontes résidents

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, daemons, continuité, admission
- **Décideurs** : GenOS
- **Lié à** : ADR 0076, ADR 0078

## Contexte

Les daemons locaux à faible fréquence et liés à un territoire peuvent apporter une
capacité persistante au Host sans devenir des agents conversationnels éphémères.
Leur découverte doit rester distincte de leur admission.

## Décision

L'adaptateur crée, dans une session persistante uniquement, un candidat symbionte de
kind `DAEMON`. Il exige un identifiant de daemon conforme, un territoire, des
capacités et des références de preuve. Le candidat déclare une cadence basse, une
exécution locale et une portée persistante. Il passe ensuite par le contrat et les
gates d'admission Holobionte habituels; l'adaptateur ne l'admet ni ne l'exécute.

## Conséquences

### Positives

- Les daemons résidents s'insèrent dans le cycle de vie des symbiontes.
- La découverte ne confère aucune autorité d'exécution.
- Une même identité daemon ne peut pas être enregistrée deux fois sur le Host.

### Négatives

- Les appelants doivent fournir des références fiables du registre daemon.
- Le cycle de vie d'exécution reste sous le contrôle du runtime daemon existant.

## Alternatives

- Admettre directement chaque daemon détecté : rejeté, car cela contournerait le
  contrat, l'essai et les gates d'immunité du Host.
