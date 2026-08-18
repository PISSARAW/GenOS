# Expérience Utilisateur (UX) lors d'une Divergence d'IA

Lorsqu'un système d'IA autonome rencontre une "divergence causale" (un bug fatal, une boucle cognitive, ou une incapacité à respecter la Matrice de Déterminisme), la façon dont cette erreur est présentée à l'utilisateur est critique. Une mauvaise UX brise la confiance ; une bonne UX transforme un échec technique en une collaboration humain-machine.

Voici les principes de conception de l'Expérience Utilisateur lors d'une divergence :

## 1. La Transparence du "Pourquoi" (Explainability)
L'utilisateur ne doit jamais se retrouver face à un simple message "Erreur du système". Le moteur de Trajectory Diffing doit être vulgarisé visuellement.

- **Affichage de l'arbre des décisions :** Montrer une mini-timeline du travail de l'agent.
- **Mise en évidence du point de divergence :** Indiquer clairement : *"J'ai réussi les étapes 1, 2 et 3. Cependant, à l'étape 4, j'ai pris la décision X en me basant sur la documentation Y. Cela a conduit à une erreur inattendue."*
- **L'UI idéale :** Un panneau scindé avec, à gauche, la trajectoire réussie et, à droite, la branche qui a échoué (similaire à un arbre Git).

## 2. Le concept d'Escalade Humaine (Human-in-the-loop Escalation)
Lors d'un Revert (retour arrière), l'IA ne doit pas s'arrêter complètement. Elle doit se mettre "en pause" (Suspend) et demander l'aide de l'humain.

- **Le "Handoff" gracieux :** L'agent doit fournir un briefing à l'utilisateur : *"Je me suis arrêté avant de causer des dommages. Voici le dernier état stable (Safest Revert Point). J'ai besoin de votre expertise sur le point précis suivant..."*
- **Micro-interactions :** Proposer à l'utilisateur des options rapides (Boutons d'action) :
  - *Option A :* "Annuler l'étape 4 et essayer une autre approche." (Déclenche un `genos_fork`)
  - *Option B :* "Je reprends la main à partir d'ici." (L'humain code manuellement l'étape bloquante, puis rend la main à l'IA).

## 3. Gestion de l'Anxiété de l'Utilisateur (Trust & Safety)
Quand une IA fait une erreur grave, l'utilisateur a peur pour ses données ou son infrastructure.

- **Preuve d'Innocuité (Proof of Safety) :** L'interface doit prouver visuellement que l'Isolation Causale a fonctionné. *"Une erreur a été détectée, mais rassurez-vous : vos fichiers originaux et votre base de données de production n'ont pas été touchés grâce à l'isolation contextuelle (Context Sandbox)."*
- **Validation Explicite avant Fusion :** L'utilisation d'outils comme `genos_merge` ne doit jamais être totalement aveugle après une divergence. L'IA doit présenter un résumé des modifications (diff) et exiger une approbation humaine (un clic explicite) avant d'appliquer les changements au système réel.

## 4. L'Apprentissage Continu (Feedback Loop UX)
La divergence est une opportunité d'améliorer le système.

- **Le bouton "Corriger ma logique" :** Permettre à l'utilisateur de laisser un bref commentaire (ex: *"Tu as utilisé l'API v1 au lieu de la v2"*). Ce commentaire est injecté dans le système via `genos_record_experience` pour que l'IA ne refasse plus jamais la même erreur d'évaluation dans ses futures trajectoires.

> [!IMPORTANT]
> **En résumé :** L'UX d'une divergence ne doit pas ressembler à une page d'erreur 404. Elle doit ressembler au bureau d'un collègue junior qui vient vous demander de l'aide : il vous explique ce qu'il a fait, où il a bloqué, vous assure qu'il n'a rien cassé, et vous demande comment débloquer la situation.
