# ADR 0640 — Journal de révocation à ancre durable

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : révocation, durabilité, anti-rollback, réplication
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0625, ADR 0638, plan de maturité vers 95/100

## Contexte

Les révocations fondatrices sont signées et chaînées, mais leur représentation
JSON locale ne fournit ni compare-and-swap durable, ni ancre de tête indépendante.
Un fichier ancien correctement signé pourrait donc remplacer le fichier courant
sans être distingué d'un état légitime.

## Décision

Persister les entrées et la tête du journal dans SQLite WAL. Chaque append :

1. ouvre une transaction `BEGIN IMMEDIATE` ;
2. vérifie la structure locale, la chaîne complète et toutes les signatures ;
3. exige la séquence et le hash de tête attendus ;
4. insère l'entrée puis avance la tête par compare-and-swap ;
5. avance une ancre conservée dans un store SQLite distinct.

La lecture n'est valide que si journal et ancre ont exactement la même séquence
et le même hash. Une interruption entre commit local et ancrage laisse le journal
en avance et donc illisible. La récupération est une opération explicite : elle
revérifie la chaîne, prouve que l'ancienne ancre est un préfixe et avance l'ancre.

La réplication lit uniquement une source ancrée, exige que la cible soit un
préfixe exact, puis applique les entrées avec les mêmes CAS et signatures. Son
rejeu exact est idempotent.

## Conséquences

### Positives

- une troncature ou une tête ancienne est détectée face à l'ancre ;
- deux writers sur la même tête ne peuvent pas tous deux réussir ;
- un replay altéré ne bénéficie pas du chemin idempotent ;
- une interruption après commit local est récupérable après réouverture ;
- une réplique divergente échoue avant d'importer des entrées.

### Limites

- le backend fourni est local et ne constitue pas un consensus distribué ;
- l'indépendance de panne dépend du placement réel du store d'ancre ;
- la réplication est déclenchée explicitement et n'est pas un protocole réseau ;
- la conservation, les sauvegardes et l'accès au fichier SQLite restent des
  responsabilités d'exploitation.

## Alternatives

Conserver uniquement le dernier hash dans le même fichier est rejeté : un rollback
restaurerait aussi ce hash. Accepter un journal en avance après interruption est
rejeté : la lecture deviendrait fail-open. Écraser une cible divergente pendant la
réplication est rejeté : cela détruirait une preuve de conflit.
