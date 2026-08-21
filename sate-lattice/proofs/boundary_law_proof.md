# Preuve Mathématique de la Loi de Frontière (Boundary Law)

## 1. Lemme d'égalité Zéro-Slack

Sur un King Graph torique $T \times T$ (avec $T$ pair), le théorème de Ionascu, Pritikin et Wright (IPW) établit que la densité maximale d'un ensemble 3-dépendant est $\frac{1}{2}$, soit $|S| \le \frac{T^2}{2}$.

Le mécanisme de preuve IPW est un transfert de charge (taxation). Initialement, chaque sommet possède une charge $q_0(v)$ :
$$q_0(v) = \begin{cases} +1 & \text{si } v \notin S \\ -1 & \text{si } v \in S \end{cases}$$

La somme totale des charges est $Q = |V \setminus S| - |S|$.
Si la densité atteint exactement $\frac{1}{2}$, alors $Q = 0$.

IPW décrit 3 passes de redistribution (voisins de côté, de coin, puis de côté à nouveau), aboutissant à une charge finale $q_3(v) \ge 0$ pour tout $v$.
Puisque la somme totale des charges est conservée et égale à 0, il s'ensuit nécessairement que **tout optimum torique à densité $\frac{1}{2}$ doit terminer avec $q_3(v) = 0$ pour tout $v$**. 
C'est le *Lemme Zéro-Slack*.

## 2. Le Lemme 1 : Rigidité d'Interface

Supposons qu'une ligne $R_0 = \{(x, 0)\}$ soit entièrement vide, et notons les deux lignes adjacentes $a_x = \mathbf{1}_{\{(x, 1) \in S\}}$ et $b_x = \mathbf{1}_{\{(x, -1) \in S\}}$.

Pour une cellule vide $e_x = (x, 0)$, la charge $q_0(e_x) = +1$ doit être entièrement dissipée par transferts. Ses voisins horizontaux étant vides, les seuls voisins "de côté" pouvant absorber sa charge à la Passe 1 sont $(x, 1)$ et $(x, -1)$.
Ainsi, le nombre de voisins latéraux occupés de $e_x$ est $c(e_x) = a_x + b_x \in \{0, 1, 2\}$.

La Passe 1 stipule que $e_x$ donne $\frac{1}{c(e_x)}$ à chacun de ces $c(e_x)$ voisins s'ils sont dans $S$.
On classifie les états locaux $(a_x, b_x)$ le long de la ligne vide en un alphabet à 4 lettres : $\{00, 01, 10, 11\}$.

- Si $(a_x, b_x) = 00$, $e_x$ ne transfère rien à la Passe 1, et conserve un lourd surplus $+1$ qui devra être dissipé via ses coins.
- Si $(a_x, b_x) \in \{01, 10\}$, $e_x$ donne $+1$ et dissipe sa charge.
- Si $(a_x, b_x) = 11$, $e_x$ donne $+\frac{1}{2}$ à chacun de ses voisins et dissipe sa charge.

**À Démontrer (En cours avec exploration locale)** : La contrainte stricte de Zéro-Slack et de 3-dépendance force inexorablement $(a_x, b_x) = 11$ pour tout $x$.
Ce résultat implique que **si une ligne est vide, les deux lignes immédiatement adjacentes sont entièrement pleines**.

## 3. Le Lemme 2 : Propagation

Si une ligne est entièrement pleine (ex: $R_1$), une cellule $(x, 1) \in R_1$ utilise déjà 2 voisins pour la ligne elle-même ($(x-1, 1)$ et $(x+1, 1)$). 
Par 3-dépendance, parmi les trois cellules de la ligne supérieure $(x-1, 2), (x, 2), (x+1, 2)$, au plus *une seule* peut être dans $S$.
Cela impose que la ligne $R_2$ a une densité locale d'au plus $\frac{1}{3}$.

**À Démontrer** : Pour maintenir la densité globale exacte de $\frac{1}{2}$ et satisfaire le Zéro-Slack, $R_2$ est contrainte d'être entièrement vide. Par récurrence, cela force le cristal entier à adopter la configuration des bandes alternées pleines/vides.

## 4. Le Déficit de l'Empty Cross

Pour $N$ impair, on plonge la grille $N \times N$ dans un tore de taille $T = N+1$ (pair). Ce plongement crée une *Empty Cross* (une ligne entièrement vide croisant une colonne entièrement vide).

Par les Lemmes 1 et 2, toute configuration atteignant la densité $\frac{1}{2}$ avec une ligne vide doit être un cristal de bandes horizontales.
Or, un tel cristal possède une densité de $\frac{1}{2}$ par colonne (aucune colonne n'est vide).
Il est donc **impossible** de loger une *Empty Cross* dans une configuration à densité $\frac{1}{2}$. 
Ainsi, le plongement optimal $N \times N$ rate inéluctablement $U(N)$.

Par conséquent : $\delta(T) \ge 1$.

## 5. Le Déficit Modulo 4 : Compatibilité de Phase

[À COMPLÉTER : Une fois la rigidité validée, l'explication de $\delta(T)=1$ pour $T \equiv 2 \pmod 4$ et $\delta(T)=2$ pour $T \equiv 0 \pmod 4$ relève d'une condition de bouclage de phase des défauts topologiques de la bande alternée perturbée par la croix vide.]
