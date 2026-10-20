# Expérience de morphogenèse Qwen pour un site promotionnel

- **Statut** : Partiel — exécution réelle, livraison refusée
- **Portée** : Trinity `controlled`, modèles Qwen locaux, matérialisation d'un artefact HTML
- **Dernière revue** : 2026-10-20

## 1. Objet

Cette expérience demande à un orchestrateur GenOS de produire, par morphogenèse,
un site promotionnel en espagnol pour la série mexicaine fictive _Señal Fantasma_,
consacrée aux dangers des réseaux sociaux.

L'objectif n'était pas seulement d'obtenir du texte généré, mais de vérifier la chaîne
complète suivante :

1. sélection d'une topologie et d'un variant ;
2. exécution de plusieurs mondes par un modèle Qwen local ;
3. écriture effective de `index.html` dans une capsule ;
4. comparaison des mondes ;
5. vérification indépendante ;
6. promotion uniquement en présence de preuves.

Le résultat est négatif : les mondes ont été exécutés et comparés, mais aucun fichier
`index.html` n'a été matérialisé. Le gate de promotion a correctement refusé la mission.

## 2. Configuration finale observée

| Élément | Valeur |
| --- | --- |
| Orchestrateur | `qwen-morphogenesis-site-compact` |
| Topologie | Trinity |
| Variant | `controlled` |
| Modèle des trois workers | `ollama://qwen2.5-coder:7b` |
| Run parent | `strategy_run_1792496596785_199c8c6f` |
| Workspace local | `D:\go\s` |
| Base d'exécution | `D:\go\d\genos.db` |
| Livrable demandé | `index.html`, autonome, inférieur à 9 000 caractères |

Les chemins `D:` identifient la preuve locale de cette exécution. Ils ne constituent
pas des ressources portables du dépôt.

## 3. Morphologie réellement exécutée

Trinity a créé trois mondes isolés, tous passés à l'état `compared` :

| Monde | Chambre | Stratégie | Type de worker résolu |
| --- | --- | --- | --- |
| 1 | `direct` | `basic_implementation` | `bounded_worker` |
| 2 | `structured` | `interview_plan_implementation` | `specialist` |
| 3 | `falsification` | `self_correcting_implementation` | `adaptive_worker` |

Les types proviennent des alias de
[`workerKindService.js`](../../backend/src/services/agents/workerKindService.js),
et non du terme `creative_candidate` ajouté dans la mission utilisateur.

### 3.1 Provenance modèle

Les trois tours persistés dans `organism_model_turns` sont `completed` et attribués à
`ollama://qwen2.5-coder:7b` :

| Monde | Entrée | Sortie | Empreinte de réponse |
| --- | ---: | ---: | --- |
| structuré | 2 343 tokens | 70 tokens | `d823049a8eb42b8b2a833936132c0a72f4a30141dc1dfcba675dca4be0c65362` |
| falsification | 2 361 tokens | 857 tokens | `9112d3e785a56df104faaf5287ed045f0bfe442284e8bb489dd6ef666cf16d94` |
| direct | 2 337 tokens | 816 tokens | `a5c3e1e7139d6924a0aceedefb8fc64fcdac4a571afaa0ddb78ca4171e35f3b7` |

Ces reçus prouvent l'appel et la réponse du modèle. Ils ne prouvent pas la création du
fichier annoncé.

## 4. Observations déterminantes

### 4.1 Monde direct : HTML généré, protocole de balises invalide

La réponse brute du monde direct contient une propriété `artifactText` de 2 787
caractères et du HTML. Elle encode cependant le livrable sous cette forme :

```text
{"artifact": "<ARTIFACT: index.html> ... </ARTIFACT>"}
```

Le protocole requis est strictement :

```text
[ARTIFACT: index.html] ... [/ARTIFACT]
```

Le matérialiseur
[`localArtifactWriter.js`](../../backend/src/services/localArtifactWriter.js) applique
une expression régulière qui n'accepte que les crochets carrés. Il n'a donc trouvé
aucun artefact à écrire.

### 4.2 Monde structuré : refus de compétence

Le worker `specialist` a retourné `outcome: unresolved`, déclaré la mission hors de
son expertise et n'a produit aucune propriété `artifactText`.

### 4.3 Monde de falsification : claims sans artefact

Le worker adaptatif a déclaré avoir créé le site, mais sa réponse ne contient ni
`artifactText` ni bloc `[ARTIFACT: ...]`. Ses références `mission` attestent seulement
la provenance de la consigne, pas l'existence d'un fichier.

### 4.4 État matériel et preuve

- aucun `index.html` n'existe dans le workspace ou dans les trois capsules ;
- les trois snapshots ont l'empreinte du contenu vide
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` ;
- chaque `evidence_vector_json` contient uniquement des valeurs `null` ;
- le run parent est `blocked` avec la raison
  `Promotion gate blocked (require_independent_verification)`.

Le refus de promotion est donc cohérent avec les preuves disponibles.

## 5. Chaîne causale

```text
Mission de création de site
  -> profil Trinity software_engineering
  -> workers bounded / specialist / adaptive
  -> schémas JSON propres à ces workers
  -> artifactText non exigé par le schéma structuré
  -> 2 réponses sans artifactText
     + 1 réponse avec balises <ARTIFACT> invalides
  -> zéro correspondance dans localArtifactWriter
  -> capsules et snapshots sans index.html
  -> aucune mesure ni vérification indépendante
  -> promotion refusée
```

## 6. Cause racine et facteurs secondaires

### 6.1 Cause racine

Le contrat de sortie structuré et le contrat de matérialisation de fichiers ne sont
pas unifiés. Quand `allow_file_edits` est actif, le schéma produit par
[`workerArtifactResponseSchema.js`](../../backend/src/services/agents/workerArtifactResponseSchema.js)
n'exige pas `artifactText`. L'instruction textuelle demande les balises, mais leur
présence et leur syntaxe ne sont pas garanties par le schéma.

Le writer, lui, est volontairement strict et ne matérialise que les balises carrées.
La génération a donc pu être considérée comme une réponse worker valide tout en ne
produisant aucun fichier.

### 6.2 Contradiction de profil

La mission demandait explicitement un contrat `creative_candidate`, mais la
morphogenèse a retenu le profil `software_engineering`. Les trois rôles techniques ont
donc reçu respectivement les contrats `bounded_worker`, `specialist` et
`adaptive_worker`. L'instruction utilisateur et le contrat runtime se contredisaient.

### 6.3 Facteurs secondaires éliminés ou observés

- le premier chemin long sous `D:\GenOS\runs\...` provoquait `ENAMETOOLONG` lors des
  snapshots ; le chemin court `D:\go\s` élimine ce facteur sans restaurer la livraison ;
- `qwen3.8:latest` a dépassé sa deadline de génération sur une tentative longue ;
  `qwen2.5-coder:7b` termine les trois tours, ce qui élimine la lenteur comme cause du
  dernier échec ;
- un worker de réparation isolé avait été refusé avant appel modèle parce que son
  parent synthétique ne possédait pas de budget modèle partagé ; ce refus n'explique
  pas le dernier run correctement budgété ;
- l'agent parent apparaît `completed` alors que son dernier run est `blocked`, et les
  enfants restent `idle` avec un dernier run `blocked`. Cette divergence explique que
  la boucle CLI puisse attendre après un verdict terminal, mais pas l'absence initiale
  du fichier ;
- les métriques du run parent restent à zéro token alors que les tours enfants portent
  une consommation mesurée. Il s'agit d'un défaut d'agrégation, pas d'une preuve
  d'absence d'appel modèle.

## 7. Ce qui a fonctionné

- la topologie Trinity et son variant ont été appliqués ;
- les trois mondes ont été isolés, exécutés par Qwen et comparés ;
- les réponses brutes, leurs empreintes et leurs consommations ont été persistées ;
- les claims non soutenus n'ont pas été promus ;
- le gate P3 a conservé le comportement fail-closed attendu.

## 8. Corrections proposées

### P0 — Unifier le contrat de fichier

Quand une mission autorise l'écriture et exige un livrable, ajouter au schéma de
réponse une propriété obligatoire et structurée, par exemple :

```json
{
  "artifacts": [
    { "path": "index.html", "content": "<!doctype html>..." }
  ]
}
```

Le runtime doit valider `path`, taille et nombre de fichiers, puis matérialiser cette
structure sans dépendre d'une convention de délimiteurs générée par le modèle.

### P1 — Aligner morphologie, rôle et livrable

Le plan morphogénétique doit associer au moins un producteur possédant une autorité
d'écriture lorsque le contrat exige un fichier. Une instruction `creative_candidate`
ne doit pas être superposée à des workers techniques ayant d'autres schémas.

### P2 — Vérifier le fichier, pas le claim

Le vérificateur indépendant doit recevoir l'empreinte du fichier réellement écrit,
contrôler sa présence, sa taille et ses contraintes minimales, puis produire un reçu
lié au snapshot. Une référence `mission` ne peut pas prouver une création de fichier.

### P3 — Harmoniser les états terminaux

Le statut de l'agent, celui du `strategy_execution_run` et celui des mondes Trinity
doivent converger vers un état terminal unique. La boucle CLI doit terminer lorsqu'un
run parent est `blocked`, même si des agents ont été remis à `idle` après révocation.

### P4 — Agréger l'usage enfant

Le bilan parent doit distinguer son usage propre de la somme des tours enfants pour
éviter un rapport de zéro token sur une mission ayant réellement appelé trois modèles.

## 9. Tests de non-régression recommandés

1. réponse JSON avec `artifacts[]` valide : fichier écrit et hash enregistré ;
2. balise en chevrons : refus explicite `INVALID_ARTIFACT_DELIMITER` ;
3. propriété de fichier absente : worker `unresolved`, jamais `success` ;
4. claim « fichier créé » sans hash : gate bloqué ;
5. fichier écrit mais sans reçu indépendant : comparaison permise, promotion bloquée ;
6. run parent bloqué avec enfants `idle` : CLI termine avec verdict bloqué ;
7. métriques parent : consommation des trois tours Qwen visible sans double comptage.

## 10. Conclusion

L'échec n'est pas un échec de la morphogenèse ni une absence d'appel à Qwen. Il est
principalement causé par une frontière incohérente entre schéma de réponse worker et
protocole de matérialisation. La protection épistémique a ensuite rempli son rôle :
sans fichier, snapshot non vide ni vérification indépendante, aucune promotion ne
devait être accordée.
