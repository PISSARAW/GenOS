# ADR 0646 — Responsabilité coding persistante au-delà de la livraison

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : SHEV, Ontogenèse, autonomie coding, preuve, reprise
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0295, ADR 0333, ADR 0607, ADR 0611, ADR 0626

## Contexte

Un agent coding asynchrone peut produire un commit, pousser une branche ou ouvrir
une revue sans démontrer que le changement livré satisfait le contrat, améliore
le projet ni reste bénéfique après intégration. Après un crash, un accusé de
transport incomplet ne permet pas non plus de savoir si l'effet externe a eu
lieu. Rejouer aveuglément peut alors dupliquer une mutation.

SHEV porte déjà un mandat persistant, tandis qu'Ontogenèse porte le projet et
ses tâches. Il manquait un dossier de responsabilité spécifique à une mission
coding, lisible après redémarrage, qui conserve la chaîne causale entre tentative,
transport, preuve de livraison et effet projet.

## Décision

Ajouter un registre interne `shev_coding_*` lié à une responsabilité SHEV active :

- `shev_coding_missions` conserve l'objectif, le propriétaire, la version du
  mandat, la génération et l'état de responsabilité ;
- `shev_coding_attempts` donne à chaque tentative un bail, une génération et un
  jeton haché qui clôt les écritures tardives ;
- `shev_coding_events` forme un journal append-only chaîné par parent et hash de
  contenu ; sa tête est portée par la mission ;
- un accusé de transport ne clôt jamais la mission ; une livraison vérifiée
  exige un vérificateur distinct et reste séparée d'un effet projet comparé ;
- seule une mesure indépendante `improved` place la mission en `verified` ; un
  effet neutre produit un diagnostic proposé, une régression exige récupération ;
- l'expiration d'une tentative en vol produit `recovery_required`. Aucun nouveau
  claim n'est autorisé avant une réconciliation externe ;
- les suites endogènes sont des propositions causales sans autorité de promotion.

Le service est interne. Cette décision n'ajoute pas de route HTTP, de nouvel
outil MCP ni d'autorité externe implicite.

## Conséquences

### Positives

- La responsabilité survit au processus qui a exécuté le changement.
- Transport, validité du livrable et effet projet ont des états et preuves
  distincts.
- Une reprise après crash est fenced par génération et échoue fermé sur un effet
  ambigu.
- Chaque initiative de suivi référence la tête causale qui l'a déclenchée.

### Négatives

- Une mission reste ouverte plus longtemps qu'un simple run coding.
- Le stockage et l'exploitation doivent gérer une mesure postérieure et un
  vérificateur réellement indépendant.
- Le service ne fournit encore ni adaptateur de métrique projet ni surface
  opérateur publique.

## Alternatives

### Clore sur commit, push ou pull request

Rejeté : cela confond transport et preuve et abandonne la responsabilité avant
la mesure de l'effet projet.

### Réutiliser uniquement le statut d'une tâche Ontogenèse

Rejeté : `done` exprime la fin du livrable, pas la causalité de l'effet, la
surveillance postérieure ni l'ambiguïté d'une opération interrompue.

### Rejouer automatiquement une tentative expirée

Rejeté : l'effet externe peut avoir eu lieu avant le crash. Une inspection
indépendante doit lever l'ambiguïté avant tout nouveau claim.
