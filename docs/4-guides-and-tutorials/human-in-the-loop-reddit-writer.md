# Tutoriel : Human-in-the-Loop avec `reddit_native_writer.py`

Ce tutoriel documente l'expérience d'intégration du mécanisme *Human-in-the-Loop* (HITL) au sein d'une tâche de rédaction pour Reddit.

## 1. Mécanisme de validation

Le script `reddit_native_writer.py` (à la racine) illustre comment geler l'exécution d'un Graphe GenOS en attendant une validation humaine, ce qui est crucial pour les publications sur les réseaux sociaux.

Le point clé est l'utilisation de la fonction `genos_checkpoint_gate` :

```python
# Point d'arrêt avant la publication
genos_checkpoint_gate(post_content)
```

## 2. Déclenchement de la Tâche `HumanApprovalTask`

Lorsque l'exécution atteint `genos_checkpoint_gate`, le système déclenche un `HumanApprovalTask` :
- L'exécution du Graphe est **suspendue**.
- Le contenu généré (`post_content`) est présenté à l'opérateur humain.
- L'opérateur peut approuver, rejeter, ou modifier.
- Une fois l'approbation confirmée, le Graphe reprend son cours naturel et procède à la publication.
