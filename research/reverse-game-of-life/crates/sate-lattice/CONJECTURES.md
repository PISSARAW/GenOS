# Conjectures et Théorèmes SATE-Lattice

## Théorème E0002-A : Résolution Exacte des N Pairs

Pour tout $N$ pair, l'optimum du problème strict (sans aucune surcharge) est exactement donné par la construction par anneaux concentriques.

$$D_3(N) = \frac{N^2}{2} + N \quad \text{pour tout } N \text{ pair}$$

*Preuve* : Par la construction des anneaux concentriques, on obtient une borne inférieure $L(N) = \frac{N^2}{2} + N$. Le lemme de Ionascu, Pritikin et Wright donne une densité maximale torique de $\frac{1}{2}$. En insérant la grille finie de taille $N \times N$ dans un tore de taille $(N+1) \times (N+1)$, la borne torique impose que la taille maximale d'un ensemble 3-dépendant soit $\lfloor \frac{(N+1)^2}{2} \rfloor$. Pour $N$ pair, cette borne vaut exactement $\frac{N^2}{2} + N$. La borne inférieure et la borne supérieure coïncident, prouvant l'exactitude de la formule.

Pour $N=20$, on a donc avec certitude $D_3(20) = 220$.

## Conjecture E0002-B : Loi de Frontière pour N Impair (Boundary Law)

La borne universelle issue du tore est $U(N) = \lfloor \frac{(N+1)^2}{2} \rfloor$.
Pour $N$ impair, on conjecture que la valeur exacte accuse un léger déficit par rapport à $U(N)$, dépendant de $N \pmod 4$ :

$$
D_3(N) =
\begin{cases}
\frac{N^2}{2} + N, & N \equiv 0, 2 \pmod 4 \quad \text{(Prouvé)}\\[4pt]
\frac{(N+1)^2}{2} - 1, & N \equiv 1 \pmod 4\\[4pt]
\frac{(N+1)^2}{2} - 2, & N \equiv 3 \pmod 4
\end{cases}
$$

Cette conjecture indique que l'incompatibilité de la taxation torique avec un carré fini de taille impaire induit nécessairement une perte exacte de 1 ou 2 cellules.

## Conjecture E0003 : Soft = Strict

Pour tout $N$, le score avec pénalités ne surpasse jamais l'optimum strict :
$$S_{3,2}(N,N) = D_3(N,N)$$
Autrement dit, autoriser les surcharges (pénalité $\lambda = 2$) n'améliore jamais l'optimum par rapport à un ensemble strictement 3-dépendant.

## Programme de Recherche

- **E0001 (Terminé)** : Oracle & constructions (Score, Anneaux, CP-SAT).
- **E0002 (En cours)** : Boundary Law (Preuve de la correction modulo 4 pour les impairs).
- **E0003** : Soft vs Strict ($S_{3,2}(N) \stackrel{?}{=} D_3(N)$).
- **E0004** : Diagramme de phases général pour $S_{k,\lambda}(N)$.
