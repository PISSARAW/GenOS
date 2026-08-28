# Les Récepteurs de Reconnaissance de Motifs (PRR, PAMPs, DAMPs)

Ce concept biomimétique est intégré dans le système immunitaire artificiel (AIS) de GenOS, situé dans `crates/genos-core/src/resilience/ais/prr.rs`. Il complète la sélection clonale et la théorie du danger.

## 1. Qu'est-ce que le corps recherche ? (Les Cibles)
Les **PRR** (Pattern Recognition Receptors) sont programmés pour reconnaître les caractéristiques universelles du danger, indépendamment d'un microbe ou d'une attaque spécifique (contrairement aux anticorps). 

Ils recherchent deux grandes catégories de motifs :

### Les PAMPs (Pathogen-Associated Molecular Patterns)
Ce sont des structures moléculaires qui possèdent un danger intrinsèque, typiquement issues d'intrus externes.
* **Dans la biologie :** ADN bactérien libre, lipopolysaccharides (LPS).
* **Dans GenOS :** Signatures de "Prompt Injection", tentatives d'accès non-autorisées, payloads viraux ou d'exploitation. Tout motif clairement malveillant venu de l'extérieur. 

### Les DAMPs (Damage-Associated Molecular Patterns)
Signaux de danger issus du propre corps de l'hôte (l'agent GenOS) lorsqu'il est gravement endommagé.
* **Dans la biologie :** Protéines cellulaires exposées suite à un traumatisme ou à la mort cellulaire.
* **Dans GenOS :** Échecs consécutifs d'outils (`ConsecutiveFailures`), divergence sémantique (`SemanticDivergence`), pollution du contexte de mémoire (`ContextPollution`), violation d'invariant critique.

## 2. Comment ça fonctionne ? (Le Déclenchement de la Réponse)
Les PRRs sont des "capteurs" logiciels patrouillant l'environnement d'exécution de l'agent.

1. **Le Scan (Détection) :** Le PRR scanne le flux d'événements (`MolecularPattern`) de l'agent. 
2. **L'Amplification du Signal :** La rencontre avec un PAMP est instantanément binaire (activation à 100%), tandis qu'un DAMP est mesuré proportionnellement à l'ampleur des dégâts (par exemple, 5 erreurs consécutives saturent le signal).
3. **L'Orchestration de la Guerre :** Si la somme d'activation dépasse le `activation_threshold` du PRR, une alerte est déclenchée. Elle permet de circonscrire la menace, souvent en initiant la réponse inflammatoire (isolation de l'agent, purge du contexte) sans attendre de savoir quel "virus" précis est à l'œuvre.

## 3. L'Efficacité du "Généraliste"
L'avantage majeur de ce modèle PRR dans GenOS est son **efficacité temporelle**. Au lieu d'invoquer un LLM complexe pour analyser sémantiquement l'intention d'un prompt attaquant ou pour évaluer la cause d'une panne, le PRR déclenche le mode "urgence totale" immédiatement dès la reconnaissance d'un motif grossier. C'est une stratégie évolutive optimale pour protéger l'essaim d'agents avant d'affiner l'analyse via l'immunité adaptative.
