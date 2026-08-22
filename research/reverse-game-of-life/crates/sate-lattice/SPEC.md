# SATE-Lattice Spécification

## Définitions

1. **Graphe** : Le graphe sous-jacent est le King Graph $G_{m,n} = P_m \boxtimes P_n$. Ses sommets sont les coordonnées $(x,y)$ avec $0 \le x < m$ et $0 \le y < n$.
2. **Voisinage** : 8 voisins de Moore (horizontal, vertical, diagonal).
3. **Sélection** : Un sous-ensemble de sommets $X \subseteq V$.
4. **Degré Induit** : $d_X(v) = |N(v) \cap X|$.
5. **Surcharge** : $O_k(X) = |\{v \in X : d_X(v) > k\}|$.
6. **Objectif Souple (Soft)** : $S_{k,\lambda}(m,n) = \max_{X} (|X| - \lambda O_k(X))$.
7. **Objectif Strict** : $D_k(m,n) = \max \{|X| : O_k(X) = 0\}$.

## Conjectures Principales

1. **Soft=Strict (A)** : $S_{3,2}(N,N) = D_3(N,N)$ pour tout $N$. L'autorisation des pénalités n'améliore jamais l'optimum.
2. **Densité (B)** : $\lim_{N\to\infty} \frac{D_3(N,N)}{N^2} = \frac{1}{2}$.
3. **Formule Exacte pour N pair (C)** : La construction par anneaux concentriques donne $L(N) = \frac{N^2}{2} + N$, et on conjecture que $D_3(N,N) = \frac{N^2}{2} + N + c(N)$ où $c(N)$ est un terme de bord.

## Validation Indépendante

Toute solution doit être vérifiable indépendamment par le `scorer` Rust. Le `scorer` est l'unique source de vérité.
