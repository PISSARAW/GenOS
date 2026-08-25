# 31. SYSTÈME ENDOCRINIEN ET ALLOSTASIE

En plus du système nerveux (rapide, direct via la nociception ou la stigmergie), GenOS utilise un système endocrinien (lent, global) pour réguler l'humeur et l'état général de l'essaim.

---

## 31.1 Diffusion Hormonale

### Ce que ça apporte à l'agent
Les "hormones" dans GenOS sont des signaux globaux qui modifient lentement le paysage de probabilité des agents. Par exemple, si le projet approche d'une deadline, l'Orchestrateur relâche du "Cortisol" (Stress) dans l'environnement. 
Cela apporte une **modulation d'ambiance à l'échelle du Swarm**. Le cortisol va progressivement inhiber les gènes de curiosité et d'exploration chez tous les agents, les forçant à se concentrer sur l'exploitation et la stabilisation du code existant.

---

## 31.2 Allostasie (Anticipation)

### Ce que ça apporte à l'agent
L'homéostasie réagit *après* une erreur (ex: baisser le rythme après un rate-limit). L'**Allostasie** est la capacité du cerveau à anticiper le besoin et à se préparer *avant*.
Dans GenOS, l'agent utilise des modèles prédictifs. S'il prévoit qu'une compilation va consommer beaucoup de RAM, il commence à élaguer ses propres caches (autophagie) *avant* même de lancer la commande.
Cela apporte **la fluidité d'exécution**. L'agent ne subit plus son environnement, il le devance.

