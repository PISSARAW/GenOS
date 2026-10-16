# ADR 0568 — Appliquer l'adaptation intra-époque

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Domaine** : orchestration, morphogenèse, runtime local, communication

## Contexte

La première boucle intra-époque comptait l'incertitude et la redondance, puis
produisait un objet de modulation. Son refocus attentionnel n'était pas consommé
par le worker et son étranglement d'échanges était déclaré après la télémétrie.
Elle décrivait donc une intention sans modifier l'inférence ni la livraison réelle.

Une adaptation continue doit rester bornée et ne doit pas contourner les preuves,
les leases, le budget ou la barrière de quiescence des changements structurels.

## Décision

1. Le superviseur transforme les signaux d'incertitude non terminaux en modulation
   versionnée, avec cinq modulations au plus par époque et une cadence bornée.
2. Pour le runtime local, le superviseur transmet le refocus par le canal IPC déjà
   authentifié par l'identité du worker et du run. Le message accepte uniquement un
   mode fermé et une force bornée ; aucun texte externe n'entre dans le prompt.
3. Le runtime compose cette directive avec les observations continues. Si une
   modulation arrive pendant la génération, il écarte la réponse calculée sur
   l'ancien contexte et relance dans le budget de latence et de tentatives.
4. La publication inter-workers calcule un digest canonique avant persistance.
   Après dix échantillons et 20 % de redondance, seul un doublon non probant est
   supprimé. Une réponse structurée `delivery: throttled` interdit de confondre
   suppression et publication.
5. Les preuves, claims, reçus, vérifications, succès, alertes critiques et handoffs
   sont toujours transmis. Une donnée nouvelle est toujours transmise.
6. Les changements de topologie, de roster, de lease et l'apprentissage évolutif
   restent différés à la barrière. Un runtime externe sans IPC reste en observation.

## Conséquences

### Positives

- Le refocus change réellement le contexte de la génération locale en cours.
- Le throttling agit sur la file de messages réelle, avant écriture et livraison.
- Les couches d'observation et d'attention se composent sans s'écraser.
- Les preuves et les transitions structurelles conservent leurs portes existantes.

### Négatives

- Une génération devenue ancienne consomme malgré tout la latence déjà écoulée.
- Le refocus immédiat n'est pas disponible pour un exécutable externe sans IPC.
- L'état rapide reste en mémoire ; seul son résumé rejoint le checkpoint d'époque.

## Validation

- Test d'une modulation reçue pendant une génération et d'une seconde tentative
  construite avec la directive d'attention.
- Test de livraison IPC liée au worker et au run actifs.
- Test de suppression du dixième doublon avant insertion SQLite.
- Test du passage inchangé d'un échange probant sous throttling actif.

## Alternatives

- **Appliquer seulement à la prochaine époque** : rejeté, car cela ne corrige pas
  l'absence d'adaptation pendant l'inférence.
- **Interrompre brutalement le processus worker** : rejeté, car les effets et
  checkpoints en cours deviendraient ambigus.
- **Étrangler tous les messages** : rejeté, car les preuves pourraient disparaître.

## Références

- [Stratégie adaptative](../02-orchestration/morphogenese-strategie-adaptative.md)
- [Orchestration](../02-orchestration/orchestration.md)
- [Morphogenèse](../02-orchestration/topologies/morphogenese.md)
