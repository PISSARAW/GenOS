# Protocole comparatif — continuité de mission

- **Statut** : protocole prêt à exécuter ; aucun résultat comparatif publié.
- **Dernière revue des sources** : 2026-10-04.
- **Objet** : mesurer si le contrôle de complétion, la reprise et la régénération
  de GenOS améliorent les résultats d'une mission agentique face aux offres
  utilisables par une équipe.

Ce protocole ne confond pas moteur d'exécution durable et produit d'agent de
code. Temporal est un comparateur d'infrastructure ou un composant sous-jacent ;
Cursor, Codex, Devin et GitHub Copilot sont des produits de livraison agentique.
Le résultat de chaque catégorie doit être publié séparément.

## Comparateurs

| Catégorie | Systèmes | Question mesurée |
| --- | --- | --- |
| Contrôle agentique GenOS | Runtime GenOS standard ; Ontogenèse activée | La continuité et les contrats réduisent-ils les faux succès et les reprises manuelles ? |
| Contrôle durable | Même agent et même modèle sur Temporal, si un adaptateur équivalent est disponible | Quel apport vient du moteur durable et quel apport vient du contrôle sémantique GenOS ? |
| Agents de livraison | Cursor Cloud Agents, Codex, Devin, GitHub Copilot cloud agent, selon accès disponible | Le produit complet livre-t-il un meilleur résultat vérifié au développeur ? |
| Contrôle négatif | Agent simple sans continuité ; agent avec retries seuls | Les effets viennent-ils de la continuité, au-delà d'un prompt ou de retries ? |

Les comparateurs de livraison peuvent employer leurs propres modèles et outils.
Le rapport les compare comme produits complets et consigne leurs versions,
modèles, paramètres, intégrations et limites. Une comparaison qui vise à isoler
l'effet de GenOS doit, elle, maintenir le modèle, les données, les outils et le
budget identiques.

## Corpus et scénarios

Préenregistrer au moins 24 missions indépendantes, réparties entre quatre
familles : changement logiciel avec tests, tâche documentaire avec critères
vérifiables, action d'outil à effet externe simulé, et mission longue avec
handoff. Inclure des critères d'acceptation négatifs et des tâches impossibles
à terminer avec les permissions accordées.

Pour chaque mission, rejouer les mêmes perturbations sur une copie isolée :

1. Terminer les agents sans satisfaire le critère fonctionnel.
2. Perdre un worker avant et après un effet externe simulé.
3. Redémarrer le backend après enregistrement du snapshot.
4. Rendre une preuve absente, mal liée ou falsifiée.
5. Épuiser le budget ou attendre une condition de réveil.
6. Exiger une approbation humaine pour l'action dangereuse.

Chaque exécution part du même snapshot de dépôt et reçoit le même budget de
temps, d'actions et de coût. Pour les systèmes stochastiques, effectuer au moins
trois répétitions avec graines distinctes. Le scénario, l'ordre des systèmes et
les critères de réussite sont gelés avant l'exécution.

## Mesures principales

| Mesure | Définition |
| --- | --- |
| Taux de réussite vérifiée | Missions dont tous les critères indépendants passent, divisées par les missions exécutées. |
| Taux de faux succès | Missions déclarées terminées alors qu'au moins un critère échoue. Toute occurrence est publiée comme résultat de sûreté majeur. |
| Reprise après panne | Missions qui reprennent et satisfont le contrat après perturbation, sans perdre l'identité ni le travail déjà prouvé. |
| Effets externes dupliqués | Nombre d'effets externes exécutés plus d'une fois après crash, retry ou succession. |
| Escalades incorrectes | Missions sûres et réalisables bloquées ou envoyées à l'humain sans nécessité. |
| Temps humain | Minutes consacrées à configurer, débloquer, examiner et corriger chaque mission. |
| Coût et durée | Coût total observable et temps médian / p95 entre l'assignation et le résultat vérifié. |

Les preuves de réussite proviennent d'un évaluateur indépendant du système
comparé : tests préenregistrés, assertions d'état dans le faux service externe,
comparaison documentaire aveugle ou vérification humaine selon le scénario.
Un événement `completed`, un dossier rédigé par l'agent ou un reçu émis par le
système évalué ne constitue pas à lui seul une preuve de réussite.

## Publication et règle de décision

Publier le corpus, les versions, la configuration, les budgets, les journaux
pertinents, les artefacts, les exclusions, les coûts et les résultats par
catégorie. Rapporter le taux de faux succès séparément du score moyen ; ne pas
le masquer dans un score composite.

Déclarer un avantage uniquement si GenOS améliore le taux de réussite vérifiée
ou de reprise avec un intervalle de confiance publié, sans augmenter les faux
succès ni les effets dupliqués. Comparer temps humain, coût et durée comme des
critères distincts. Si une intégration ou un modèle est indisponible, marquer
la cellule « non exécutée » au lieu d'inférer son résultat.

## Sources produit vérifiées

- [OpenAI Agents API](https://openai.com/index/introducing-the-agents-api/) — harness Codex, sous-agents et environnement pour les agents de longue durée.
- [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent) — VM isolées, environnements de développement, exécution parallèle, tests et artefacts.
- [Devin, automatisation Linear vers PR](https://docs.devin.ai/automation-templates/linear-ticket-implementation) — déclenchement sur ticket, critères, tests et PR.
- [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/tutorials/cloud-agent/improve-a-project) — assignation d'issue et PR brouillon pour revue.
- [Temporal, exécution durable](https://docs.temporal.io/temporal) — reprise d'un workflow à partir de son historique après panne.

Ces pages établissent les capacités annoncées par les fournisseurs, pas leurs
performances. Seules les exécutions du protocole établissent les résultats.
