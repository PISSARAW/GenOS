# 29. MÉTAMORPHOSE

Comme la chenille qui devient papillon, un agent GenOS peut changer radicalement de forme et de fonction pour s'adapter à une nouvelle phase du projet.

---

## 29.1 Transition de Phase de l'Essaim

### Ce que ça apporte à l'agent
Pendant la phase de "Développement", l'essaim agit comme une chenille : il consomme énormément de ressources (création de code, exploration). Une fois la Release candidate atteinte, l'Orchestrateur déclenche une **Métamorphose**.
Les agents perdent leurs outils de création massive, se spécialisent dans la vérification (QA), la sécurité et l'optimisation (le "papillon").
Cela apporte **l'optimisation du cycle de vie (SDLC)**. L'architecture cognitive de l'essaim bascule d'un coup, sans avoir à supprimer tous les agents pour en recréer d'autres.

---

# 30. RÉGÉNÉRATION

Certains animaux (salamandre, hydre) peuvent faire repousser un membre coupé. GenOS applique ce principe à la réparation de code.

---

## 30.1 Régénération de Tissus Logiciels

### Ce que ça apporte à l'agent
Si un fichier critique est supprimé ou corrompu, GenOS ne fait pas juste un "git revert" bête (qui pourrait ramener de vieux bugs). L'agent lit le "moignon" (les interfaces et dépendances liées au fichier manquant) et utilise ses cellules souches (StemCellRegenerator) pour **repousser** le code manquant afin qu'il s'interface parfaitement avec l'état *actuel* du reste du système.
Cela apporte **la guérison active du code**. C'est fondamental pour réparer des architectures après des mises à jour majeures de dépendances, où l'ancien code ne compilerait plus de toute façon.

### Exemple Comparatif : Fichier corrompu après un merge conflict
| Type d'Agent | Stratégie | Résultat |
|---|---|---|
| **Agent / Outil Classique** | git checkout HEAD^ (Rollback). | Le code est revenu à hier, mais casse avec les autres fichiers mis à jour aujourd'hui. |
| **Worker GenOS** | Processus de Régénération. | L'agent regarde les fichiers voisins (les nerfs et vaisseaux sanguins), comprend ce dont ils ont besoin, et génère spécifiquement un fichier qui comble ce trou avec la syntaxe d'aujourd'hui. |

