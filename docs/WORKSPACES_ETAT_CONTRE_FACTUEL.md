# Workspaces et état contre-factuel dans GenOS

## 1. Objet et périmètre

Cette documentation décrit la gestion des workspaces, des branches, des snapshots et du contre-factuel tel qu’ils sont effectivement implémentés dans le dépôt GenOS. Elle ne décrit pas un concept générique de “sandbox” de bout en bout : elle reflète les services et les mécanismes réellement présents dans le code, notamment :

- [backend/src/services/workspaceSnapshotStore.js](../backend/src/services/workspaceSnapshotStore.js)
- [backend/src/services/bisectionService.js](../backend/src/services/bisectionService.js)
- [backend/src/services/agentWorkspaceLifecycleService.js](../backend/src/services/agentWorkspaceLifecycleService.js)
- [backend/src/services/vfsSandboxService.js](../backend/src/services/vfsSandboxService.js)
- [backend/src/services/strategyPromotionPolicyService.js](../backend/src/services/strategyPromotionPolicyService.js)
- [backend/src/controllers/workspaceController.js](../backend/src/controllers/workspaceController.js)
- [backend/src/db/schema-tables-core.js](../backend/src/db/schema-tables-core.js)

Le sujet central est la capacité du système à :

- isoler un état de travail ;
- capturer un snapshot durable ;
- créer une copie ou un worktree de travail ;
- comparer deux états ;
- ré-exécuter un cas de test sur un instant précis ;
- faire un restore ou rollback sécurisé ;
- identifier le point de divergence causale ;
- mesurer la blast radius d’une mutation ;
- nettoyer les artefacts temporaires sans laisser de chaos.

---

## 2. Définition fonctionnelle

GenOS traite les workspaces comme des états de calcul isolés, potentiellement concurrents, potentiellement mutés, et toujours évaluable par comparaison et reprise.

Un workspace n’est pas seulement un dossier de projet. C’est un environnement d’exécution avec :

- une racine de fichiers ;
- un identifiant de workspace ;
- un historique de snapshots ;
- un état de branche/fork ;
- un ensemble d’artefacts de test et de replay ;
- une capacité à restaurer un état antérieur sans perdre l’état protecteur.

Le système distingue plusieurs formes de séparation :

1. Capsulas isolées : environnement de travail dédié à un agent ou à un flux ;
2. Git worktrees : clones de travail partagés sur le même dépôt Git ;
3. Copies non-Git : copies directes de répertoire pour un dépôt non versionné ;
4. Snapshots : instantanés checksumés de fichiers ;
5. Branches / forks : états de travail distincts, souvent comparés sur base causale ;
6. Counterfactual states : variantes alternative d’un même flux de calcul à tester sans écraser le parent.

---

## 3. Architecture réelle du dépôt

### 3.1 Tables et états

Le schéma principal contient notamment `workspaces` et `workspace_snapshots` dans [backend/src/db/schema-tables-core.js](../backend/src/db/schema-tables-core.js).

Le modèle est le suivant :

```text
workspaces
  ├── id
  ├── name
  ├── path
  ├── organization_id
  ├── project_id
  └── metadata

workspace_snapshots
  ├── id
  ├── workspace_id
  ├── snapshot_hash
  ├── step_number
  ├── label
  ├── author
  ├── reason
  ├── diff_summary
  ├── metadata
  └── created_at
```

Cela permet de traiter chaque variation de travail comme un état reproductible, indexé par un hash durable.

### 3.2 Snapshot durable

Le service [backend/src/services/workspaceSnapshotStore.js](../backend/src/services/workspaceSnapshotStore.js) capture des fichiers dans un dossier `.genos/workspace-snapshots` ou un chemin configuré via `GENOS_SNAPSHOT_ROOT`.

Le mécanisme :

- parcourt le workspace ;
- ignore les dossiers sensibles (`.git`, `node_modules`, `target`, etc.) ;
- refuse les symlinks et les chemins sortant du workspace ;
- calcule le hash SHA-256 de chaque fichier ;
- sauvegarde les fichiers dans une structure payload par hash ;
- enregistre une entrée SQLite `workspace_snapshots` ;
- vérifie à la fin que le snapshot est cohérent.

Le code explicite clairement une contrainte de sécurité : le snapshot ne doit pas refléter des chemins arbitraires ni des fichiers sensibles.

### 3.3 Capsules isolées et worktrees

Le service [backend/src/services/agentWorkspaceLifecycleService.js](../backend/src/services/agentWorkspaceLifecycleService.js) crée pour les agents des environnements d’exécution isolés.

Il prend deux formes :

- worktree Git si le repo est Git ;
- copie de dossier si le projet n’est pas Git.

Les principes sont :

- ne jamais laisser une capsule survivre indéfiniment ;
- suivre sa durée de vie via `agent_capsule_cleanup` ;
- supprimer les capsules après la fin du runtime ;
- utiliser un délai de GC configurable via `GENOS_WORKTREE_GC_DELAY_MS`.

La logique est explicitement orientée vers la gestion de la “durée de vie des capsules” pour éviter la croissance incontrolée des dossiers d’état.

### 3.4 Contrôle de la blast radius

Le service [backend/src/services/vfsSandboxService.js](../backend/src/services/vfsSandboxService.js) calcule un score de blast radius sur les effets secondaires d’un outil de fichier ou d’exécution :

- nombre de fichiers modifiés ;
- caractère destructif ;
- rôle requis ;
- potentiel d’exécution de processus.

La formule est simplifiée à :

$$
BR = \min(100, \max(0, 5 + \min(45, n \times 15) + 35 \cdot I_{destructive} + 15 \cdot I_{admin}))
$$

avec :

- $n$ = nombre de fichiers touchés ;
- $I_{destructive}$ = 1 si l’action est destructive, 0 sinon ;
- $I_{admin}$ = 1 si l’exécution requiert un rôle admin.

Cela crée un score de risque utilisable pour décider si une action doit être en dry-run, under review, ou refusée.

---

## 4. Mathématiques du contre-factuel

### 4.1 État et divergence

On peut représenter un workspace par un état $S$ :

$$
S = (F, M, E)
$$

où :

- $F$ = ensemble des fichiers ;
- $M$ = métadonnées du workspace ;
- $E$ = environnement d’exécution / runtime / branch / task context.

Deux états $S_1$ et $S_2$ divergent selon leur différence de fichiers et de métadonnées :

$$
\Delta(S_1, S_2) = \{x \;|\; hash_{S_1}(x) \neq hash_{S_2}(x)\}
$$

Le système GenOS fait exactement cela dans `preview()` et `diffWorkspaces()`: il compare les fichiers à un snapshot de référence et calcule les fichiers affectés.

### 4.2 Bisection causale

La bisection causale est une recherche dichotomique sur un historique de snapshots. Le code dans [backend/src/services/bisectionService.js](../backend/src/services/bisectionService.js) applique l’algorithme de recherche du premier snapshot mauvais.

La complexité est :

$$
T(n) = O(\log n)
$$

car on réduit l’espace de recherche par 2 à chaque étape.

Le service vérifie que la séquence de santé est monotone : healthy → fail → fail, puis trouve le premier snapshot ne satisfaisant plus l’invariant.

### 4.3 Rollback sélectif

Le rollback est un restaurer localisé, fondé sur une référence snapshot :

$$
S_{restored} = restore(S_{target}, ref)
$$

Le service [backend/src/services/workspaceSnapshotStore.js](../backend/src/services/workspaceSnapshotStore.js) exécute un saveguard pre-restore, puis réécrit le workspace à partir du snapshot vérifié. S’il y a un échec, il tente un restore de sécurité depuis le snapshot de protection.

### 4.4 Coût de la fusion

La fusion de workspaces est contrôlée par [backend/src/services/strategyPromotionPolicyService.js](../backend/src/services/strategyPromotionPolicyService.js). Si deux changements se chevauchent sur le même fichier sans base commune, on marque un conflit. Le critère est :

- si `winner == base` : pas de changement ;
- si `target == base` : changement candidat ;
- si ni `winner` ni `target` ne correspondent à `base` : conflit.

Cela produit une logique de merge sécurisée : pas d’écriture automatisée quand la causalité est ambiguë.

---

## 5. Biologie du contre-factuel

GenOS adopte une logique biomimétique qui ressemble à l’évolution et à la mémoire contextuelle des systèmes vivants :

### 5.1 Capsule comme niche d’évolution

Une capsule isolée est comparable à un niche écologique :

- un agent travaille dans un environnement séparé ;
- les effets sont localisés ;
- le système peut expérimenter une variante sans contaminer le parent.

### 5.2 Snapshot comme mémorisation d’un état

Un snapshot est une trace de l’état d’un organe ou d’un système à un instant donné. Il garde une image immuable de la configuration, comme un enregistrement de l’état cellulaire avant une mutation.

### 5.3 Bisection comme recherche de cause racinaire

La bisection causale ressemble à l’identification d’un point critique dans une séquence de développement :

- on vérifie le milieu de l’historique ;
- on localise le passage où le système bascule de sain à malade ;
- on isole le point de divergence.

### 5.4 Blast radius comme zone de contamination

La blast radius est la zone d’impact potentiel d’une mutation ou d’un changement. Le service VFS calcule cette “zone d’attaque logique” sur des fichiers, des effets destructifs et des privilèges nécessaires.

---

## 6. Cas d’usage concrets du dépôt

### 6.1 Correction de bug dans un workspace isolé

Un agent lance une tentative de patch dans une capsule. Avant la mutation, le système capture un snapshot. La tentative est testée dans un environnement isolé. Si elle échoue, la bisection permet de localiser le mauvais changement et le rollback ramène l’état stable.

### 6.2 Forks et contre-factuels

Le système peut comparer deux branches, deux trajets, deux hypothèses. Un fork est une branche d’état alternative. Un contre-factuel n’écrase pas le parent : il permet de tester un variante de stratégie ou de patch sans destruction du workspace principal.

### 6.3 Merge automatique contrôlé

Le service de promotion applique des règles de sécurité avant merge. Si le changement est validé avec replay, evidence et approval, il peut procéder à un merge. Sinon, le merge est refusé ou transformé en conflit explicite.

### 6.4 Reconstruction de l’état à partir d’un snapshot

Une exécution peut être re-fondée depuis un snapshot codé comme payload + manifest + checksum. Cette capacité est essentielle pour le replay, le debug causale et l’autotest à partir de l’état exact d’un instant donné.

### 6.5 Nettoyage des artefacts temporaires

Le service [backend/src/services/agentWorkspaceLifecycleService.js](../backend/src/services/agentWorkspaceLifecycleService.js) gère le nettoyage des capsules et du garbage des worktrees. Cela évite les “ghost workspaces” laissés après un crash ou une fin de runtime.

---

## 7. Exemple concret d’utilisation

### Exemple 1 — patch de bug avec snapshot + bisection

1. Le workspace principal est actif.
2. Un agent crée un snapshot `snp-123` avant le patch.
3. L’agent modifie un fichier et exécute un test.
4. Le test échoue.
5. Le système récupère l’historique des snapshots et exécute une bisection.
6. Le code identifie le point où l’état est passé de “healthy” à “failing”.
7. Le rollback restaure le snapshot de sécurité.
8. Le patch est rejeté ou re-travaillé dans une capsule isolée.

### Exemple 2 — merge de branches

- `winnerWorkspace` contient une version validée.
- `targetWorkspace` contient un branche de travail.
- `baseWorkspace` sert de point de référence.
- Le système compare les fichiers, détecte les conflits, et n’applique le merge que si les changements sont causaux et non ambiguës.

### Exemple 3 — dry-run blast radius

Une action `genos_run` ou `genos_restore` est simulée dans le VFS. L’outil retourne :

- risk score ;
- files affected ;
- isDestructive ;
- required privilege ;
- résultat final autorisé / refusé.

---

## 8. Schéma fonctionnel

```text
Workspace source
   │
   ├── snapshot capture
   │      ↓
   │   workspace_snapshots + hash manifest
   │
   ├── isolated capsule
   │      ├── git worktree (Git repo)
   │      └── plain copy (non-Git repo)
   │
   ├── fork / branch / counterfactual state
   │      ↓
   │   diff + replay + test
   │
   ├── bisection causale
   │      ↓
   │   identify first bad snapshot
   │
   ├── rollback / restore
   │      ↓
   │   checksum-verified restore
   │
   └── cleanup artifacts
          ↓
       remove orphaned worktrees / copies
```

---

## 9. Processus de travail réel dans GenOS

### 9.1 Capture d’un état

Le flux de snapshot est :

1. Vérifier que le workspace existe ;
2. nettoyer les artefacts anciens ;
3. collecter les fichiers de façon sécurisée ;
4. calculer leurs hashes ;
5. copier les fichiers sous une racine immutable ;
6. écrire le manifeste JSON ;
7. enregistrer dans `workspace_snapshots` ;
8. vérifier la cohérence du hash final.

### 9.2 Materialisation d’un snapshot

La materialization construit un dossier de travail à partir du manifest. Elle vérifie :

- absence de chemins dangereux ;
- intégrité des hashes ;
- conformité avec la limite de taille ;
- validité du manifest global.

### 9.3 Exécution dans une version du snapshot

Le service `runInSnapshot()` remonte l’état cible dans un dossier temporaire, exécute la commande autorisée, puis renvoie la sortie et le hash du snapshot. Cette exécution est pleinement isolée et ne touche pas directement le workspace source.

### 9.4 Bisection et rollback

Le `bisectAnomalyAsync()` fonctionne sur un historique de snapshots ordonné. Il vérifie la monopartie de l’état de santé, réduit l’intervalle, trouve le point de bascule, puis donne un rapport de cause probable. Le `remediateRollback()` restaure l’état critique de façon atomique.

### 9.5 Nettoyage

Le système purge :

- worktrees Git orphelines ;
- copies non-Git obsolètes ;
- snapshots sans références ;
- dir d’artefacts temporaires créés pendant les tests.

---

## 10. Branches, forks, replay et merge

### 10.1 Branches et forks

Dans le dépôt, les forks sont traités comme états parallèles qui peuvent être comparés de manière causale. Les services de stratégie et le service de promotion supposent des états distincts qui doivent être testés avant merge.

### 10.2 Replay

Le replay est un concept clé : reconstituer un état ayant déjà été validé, ou ré-exécuter un test exactement sur une version passée du workspace. Le runtime respecte cette logique sans faire de “fake replay” : il re-matérialise le snapshot vérifié, puis lance la commande dans un runner isolé.

### 10.3 Merge

Le merge est autorisé uniquement quand le contrat le permet et si les modifications sont compatibles. Le service [backend/src/services/strategyPromotionPolicyService.js](../backend/src/services/strategyPromotionPolicyService.js) exige :

- replay validé ;
- vérification indépendante ;
- approbation humaine si requis ;
- préservation des branches rejetées ;
- fusion seulement si la base est causale et sans conflit.

---

## 11. Collision et blast radius

### 11.1 Collision

Une collision est une situation où deux états modifient la même zone au même moment ou de façon non-commutative. Le service `diffWorkspaces()` et le service `mergeWorkspaces()` le détectent explicitement via les chemins identiques ou les différences basées sur la base commune.

### 11.2 Blast radius

La blast radius correspond à la quantité de surface affectée par une action. GenOS la modélise surtout dans [backend/src/services/vfsSandboxService.js](../backend/src/services/vfsSandboxService.js), où :

- les fichiers touchés comptent ;
- la nature destructive compte ;
- le privilège requis compte.

Cette mécanique permet de stopper les mutations trop larges ou d’exiger une validation plus forte.

---

## 12. Comparaison avec le marché

| Approche du marché | Point fort | Limite | Positionnement GenOS |
| --- | --- | --- | --- |
| Git worktree classique | simple et fiable pour branches | peu de contrôle sur l’état, relecture, blast radius, et replay durable | GenOS ajoute snapshot durables, validation de manifest, restore vérifié et bisection causale |
| Docker / devcontainer | isolement fort | coûteux, pas naturellement centré sur le contre-factuel et la branche causale | GenOS garde un modèle plus léger et plus “workspace-aware” |
| Sandbox d’IDE / ephemeral environments | expérimentation rapide | souvent sans historique, sans restore explicite ni comparaison de causalité | GenOS a un historique de snapshots et un moteur de rollback |
| GitOps / branch policy | bonne gouvernance | peu ou pas de simulation de blast radius ni de comparaison d’état | GenOS ajoute la mesure du risque et l’évaluation du contre-factuel |
| VM snapshot / revert | restauration brute | lourdeur et manque de granularité sur les changements causaux | GenOS garde l’état sous forme de manifest + hash + bisection |

Le vrai différenciateur de GenOS est qu’il ne confond ni “copie du dépôt”, ni “branch Git”, ni “snapshot de sécurité”. Il construit une couche d’état explicite, immuable, comparable et restaurable, avec contrôle de causalité et de risque.

---

## 13. Forces de GenOS

- isole plusieurs états de travail dans des capsules ;
- crée des snapshots durables, vérifiés par hash ;
- permet des branches, forks et contre-factuels sans écraser le parent ;
- exécute le replay dans un environnement isolé ;
- trouve le point de bascule avec bisection causale ;
- restaure les états avec protection et checksum ;
- contrôle la blast radius avant exécution ;
- nettoie les artefacts temporaires et les worktrees orphelines.

---

## 14. Limites et garde-fous

- le système est très orienté runtime et état de filesystem ; il ne remplace pas un système de versionnement déployé sur plusieurs services ;
- la bisection est robuste sur des historiques monotones, mais des séquences non monotones doivent être rejetées ou relancées avec un contexte plus riche ;
- le restore garantit la cohérence du manifest, mais il repose toujours sur un environnement de travail contrôlé ;
- le nettoyage est utile mais doit être supervisé pour éviter l’effacement d’un workspace encore vivant.

---

## 15. Conclusion

Les workspaces et l’état contre-factuel de GenOS forment une couche de contrôle de l’exécution qui dépasse le simple “sauvegarder des fichiers”. Le système met en place une chaîne complète :

- isolation ;
- snapshot ;
- comparaison ;
- fork / branch ;
- replay ;
- bisection causale ;
- rollback ;
- merge conditionnel ;
- blast radius ;
- nettoyage.

Le coeur du système est un modèle où l’état est un objet vérifiable, comparable et restaurable, et où l’anomalie n’est pas traitée par instinct mais par causalité, hash et preuve d’intégrité.

Les références de code les plus importantes sont :

- [backend/src/services/workspaceSnapshotStore.js](../backend/src/services/workspaceSnapshotStore.js)
- [backend/src/services/bisectionService.js](../backend/src/services/bisectionService.js)
- [backend/src/services/agentWorkspaceLifecycleService.js](../backend/src/services/agentWorkspaceLifecycleService.js)
- [backend/src/services/vfsSandboxService.js](../backend/src/services/vfsSandboxService.js)
- [backend/src/services/strategyPromotionPolicyService.js](../backend/src/services/strategyPromotionPolicyService.js)
- [backend/src/controllers/workspaceController.js](../backend/src/controllers/workspaceController.js)
- [backend/src/db/schema-tables-core.js](../backend/src/db/schema-tables-core.js)
