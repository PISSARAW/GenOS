# Évolution probante des interfaces Studio

## Portée implémentée

La tranche V0 transforme la génération d'interface en proposition révisable.
Elle ne remplace pas les outils de création visuelle : elle ajoute les contrats
qui empêchent de confondre rendu, utilité et droit de publier.

| Étape | Contrat | Sortie sans preuve suffisante |
|---|---|---|
| Baseline | intention UX et design system versionnés et hashés | rejet de l'entrée |
| Variante | monde isolé, artefact et provenance liés à la baseline | rejet de la variante |
| Évaluation | accessibilité, performance, cohérence, anti-générique | dimension `MISSING` |
| Observation | sessions utilisateur distinctes des screenshots | `realUserObserved: false` |
| Décision | effet mesuré, protocole, avis complets et non contestés | `NO_CHANGE` |
| Dérive | signal, seuil et référence de preuve | `NO_CHANGE` ou diagnostic |
| Changement | autorité explicite et plan de rollback lié | aucun déploiement |

## Invariants

Une capture peut soutenir une inspection visuelle, jamais simuler un participant.
Un désaccord entre évaluateurs devient `DISPUTED`. Il ne reçoit pas un score
moyen arbitraire. Une mesure locale positive ne vaut que pour le protocole et la
baseline référencés.

`OPEN_DIAGNOSTIC` autorise l'investigation, pas la modification. De même,
`READY_FOR_AUTHORIZED_DEPLOYMENT` est un dossier complet, pas la preuve qu'une
publication a eu lieu. L'exécution reste la responsabilité de la boucle Studio,
avec ses propres contrôles d'autorité, de staging et de révision CAS.

## Exemple minimal

```js
const decision = governance.decide({
  baseline,
  minimumGain: 0.1,
  options: [{ candidate, evaluation, measuredEffect: {
    delta: 0.25,
    evidenceRef: 'experiment://paired-navigation',
    protocolRef: 'protocol://task-completion-v2'
  } }]
});
```

La sortie est `PROPOSE_CHANGE` uniquement si toutes les dimensions valent
`PASS`, qu'une session utilisateur est reliée et que le gain dépasse le seuil.
Même dans ce cas, `promotionGranted` et `deploymentExecuted` restent faux.

## Limites honnêtes

Cette tranche n'exécute pas de test utilisateur, de mesure navigateur ni de
déploiement. Elle valide la structure et les liens de provenance fournis, pas le
contenu des artefacts externes. Elle ne revendique pas de supériorité visuelle.

L'apprentissage inter-projets est volontairement fermé : les dossiers conservent
les références nécessaires à de futures réplications, mais aucune règle n'est
transférée ou assimilée automatiquement tant qu'un protocole indépendant n'est
pas implémenté et vérifié.
