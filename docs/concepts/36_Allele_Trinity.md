# Analyseur de Fréquence Allélique & Mode Trinity

Le dashboard UI de GenOS dispose de fonctionnalités avancées de monitoring et de déploiement qui agissent directement sur l'évolution de la flotte.

## Allele Frequency Analyzer
Il monitore l'apparition et le succès des traits (gènes) au sein de la flotte :
- **dominant_beneficial** : Trait qui permet une réussite systématique. Renforcé et distribué.
- **lethal** : Trait menant à un échec (crash, hallucinations). Supprimé rapidement.
- **neutral** : Trait sans impact mesurable.

L'analyseur permet d'avoir une vision populationnelle des prompts d'agents, plutôt que de débugger un seul agent.

## Mode Trinity (Trinity Agent Deploy)
Pour des tâches critiques, GenOS déploie le Mode Trinity :
- Trois agents isolés sont instanciés avec des configurations ou modèles différents (par ex : `direct_author`, `planned_author`, `self_correcting_literary_author`).
- Ils tentent tous de résoudre le même problème.
- Une phase de consensus (ou de sélection du meilleur résultat via l'arène) détermine la version finale.
- Cette redondance garantit une résilience cognitive face aux hallucinations ou erreurs de raisonnement.
