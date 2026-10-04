# ADR 0305 — Fenêtre d'observation du resident daemon

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, observation, anomalies
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0304

## Contexte

Le `resident_daemon` décrivait une surveillance de territoire, mais
la campagne comparative ne disposait d'aucune observation exécutée
et mesurable pour ce type.

## Décision

La méthode `monitor_samples` accepte une fenêtre bornée d'échantillons
numériques, chacun horodaté et référencé. Elle calcule les valeurs qui
dépassent strictement un seuil fini et rend un dossier avec l'identifiant
du territoire, le dernier instant observé, toutes les références et un
reçu du calcul. L'exécution ne consomme aucun token de modèle.

## Conséquences

Un cas de détection devient mesurable indépendamment. Le reçu relie la
fenêtre fournie au résultat ; il ne certifie pas l'authenticité des
capteurs. Cette route est une inspection ponctuelle et ne fournit ni
processus résident permanent, ni abonnement, ni garantie de détection
entre deux fenêtres.

## Alternatives

- Inférer une anomalie à partir d'une description libre : rejeté pour
  ce cas, faute de mesure reproductible.
- Déclarer le daemon continuellement actif après un seul calcul :
  rejeté, faute de processus de surveillance durable.
