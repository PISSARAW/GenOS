# ADR 0274 — Exécution vérifiée des campagnes GVX

- **Statut** : Accepté
- **Date** : 2026-10-02
- **Domaine** : GVX, benchmarks, preuves, exécution
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0263, ADR 0266, ADR 0270

## Contexte

Le dépôt définit un protocole et un dimensionnement statistique GVX, mais pas de chemin
d'exécution permettant de parcourir les variantes, jeux et seeds avec une preuve métier
vérifiable. Un runner qui ne ferait confiance qu'aux métriques déclarées par son processus
local pourrait produire un rapport reproductible sans établir que les mesures sont vraies.

## Décision

Les campagnes sont lancées par un point d'entrée Node qui charge un module d'adaptateurs
épinglé par SHA-256. Le module construit un manifeste préenregistré, les runners et les
accès aux artefacts, et un client du service de vérification distant. Pour chaque métrique,
le runner exige un reçu signé liant la valeur à la variante, la cohorte, le split, le seed,
le hash du dataset, le verrou de modèle et le hash d'outils. Il vérifie les hashes des
datasets, impose un budget annoncé, exige la couverture complète du protocole, puis relit
les artefacts persistés avant de produire une synthèse descriptive.

La synthèse reste `comparisonAuthority: none`. Le coût fourni en sortie est une vérification
après exécution; les adaptateurs de runner doivent interrompre eux-mêmes le travail dès que
le budget est épuisé. Aucun dataset, vérificateur métier ou résultat de campagne n'est
fabriqué par défaut.

## Conséquences

### Positives

- Une commande opérateur peut exécuter une campagne sans déplacer les vérificateurs dans le
  processus du runner.
- Les sorties locales non couvertes par des reçus signés, les datasets altérés et les
  artefacts non relisibles échouent avant la synthèse.
- L'annulation et une limite globale de runs bornent la campagne.

### Limites

- Les adaptateurs et vérificateurs propres au domaine restent à fournir et épingler.
- L'application effective du budget dépend aussi du runner de chaque variante.
- Les campagnes, baselines et capteurs empiriques restent `not_run` sans données qualifiées.

## Alternatives

- Accepter les nombres retournés par le runner local : rejeté, car le même processus pourrait
  annoncer des mesures non vérifiées.
- Marquer la synthèse comme comparaison concluante dès que la couverture est complète :
  rejeté, car le protocole descriptif et son approximation de puissance ne remplacent pas
  une analyse comparative préenregistrée.
