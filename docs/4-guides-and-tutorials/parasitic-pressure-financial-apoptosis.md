# Tutoriel : Parasitic Pressure & Financial Apoptosis

Ce tutoriel détaille l'expérience de gestion d'une "Parasitic Pressure" conduisant à une "Financial Apoptosis", afin d'empêcher un agent GenOS de dépasser son budget en raison de boucles infinies ou d'appels excessifs.

## 1. Contexte de l'expérience

Le script `financial_apoptosis_experiment.py` simule un agent opérant sous des contraintes financières. Nous injectons une pression parasitaire (`genos_parasitic_pressure`) qui augmente artificiellement la consommation des ressources de l'agent.

## 2. Exécution CLI et Comportement

L'expérience se lance via la commande suivante :
```bash
python financial_apoptosis_experiment.py --budget 1000
```

### Déroulement attendu :
1. **Initialisation** : Le script démarre avec un budget défini.
2. **Pression Parasitaire** : L'outil `genos_parasitic_pressure` est appelé pour simuler un environnement hostile ou défaillant (ex: surconsommation d'API).
3. **Surveillance (Monitoring)** : Le coût de l'agent augmente progressivement :
   ```
   Agent consumed resources... Current cost: 100/1000
   Agent consumed resources... Current cost: 200/1000
   ```
4. **Seuil Critique (Threshold Reached)** : Dès que le budget de `1000` est atteint, le système lance une alerte.
5. **Événement d'Apoptose** : L'outil `genos_resilience_apoptosis` est déclenché. L'agent est terminé de manière "graceful" (propre), arrêtant net l'hémorragie financière.

## 3. Conclusion

Ce mécanisme démontre la capacité d'auto-préservation de GenOS. Plutôt que de continuer à consommer des ressources à l'infini lors d'un comportement défectueux, l'agent sacrifie son processus pour maintenir les coûts prévisibles et contrôlés.
