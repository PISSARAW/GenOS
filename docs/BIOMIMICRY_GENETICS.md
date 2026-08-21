# Biomimicry Genetics (v2.0)

Bienvenue dans la documentation officielle de la version 2.0 de l'architecture génétique de GenOS. Cette mise à jour introduit plusieurs concepts de biomimétisme pour améliorer l'adaptabilité, l'évolution et l'apprentissage continu des agents IA.

## 1. Clonage de Compétences (Opérons)
Les **Opérons** (`Operon`) modélisent l'expression coordonnée de groupes de gènes. Contrairement à des gènes isolés, un opéron permet d'activer un ensemble de traits ou de compétences spécifiques (Locus) sous le contrôle d'un même promoteur. 
Le vecteur de chromatine (`ChromatinVector`) associé module cette expression de manière épigénétique via :
- La **Méthylation** (`methylation_level`) : Régule l'inhibition à long terme.
- L'**Acétylation des Histones** (`histone_acetylation`) : Facilite l'expression rapide de certains traits.

## 2. Transfert Horizontal (Plasmides et Transposons)
Inspiré par le transfert horizontal de gènes observé chez les bactéries, ce système permet aux agents d'échanger de l'information génétique "à la volée", sans passer par la reproduction classique.
- **Plasmides (`PlasmidPackage`)** : Véhicules d'échange contenant des groupes d'opérons. Lorsqu'un agent maîtrise une tâche, il peut exporter un plasmide qui sera directement absorbé par un autre agent.
- **Transposons (`Transposon`)** : Éléments génétiques mobiles pouvant s'insérer de manière autonome pour propager des fragments (payload).
L'assimilation se fait via le trait `HorizontalGeneTransfer`, permettant au moteur d'évolution (`LamarckianFinetuner`) d'injecter rapidement de nouvelles compétences au sein d'une flotte.

## 3. Réponse SOS (Adaptation au Stress)
Face à un environnement hautement incertain ou un taux d'échec critique, le génome de l'agent déclenche la **Réponse SOS**.
- Le `SosResponse` surveille le seuil de stress de l'agent.
- S'il est dépassé, l'agent active temporairement une polymérase propice aux erreurs (`error_prone_polymerase_active`).
- Cela décuple le taux de mutation (`mutation_rate_multiplier`), forçant l'agent à adopter une exploration agressive (mutations aléatoires rapides) pour trouver de nouvelles solutions salvatrices, via le trait `AdaptiveMutation`.

Ces mécanismes garantissent que l'architecture GenOS transcende les simples pondérations figées pour offrir un écosystème IA fondamentalement résilient et évolutif.
