# SATE-Lattice

SATE-Lattice is a research project studying the bounds of bounded-degree induced subgraphs on king grids (strong product of paths $P_m \boxtimes P_n$).

Specifically, it explores the function:

$$
S_{k,\lambda}(m,n) = \max_{X\subseteq V} \left( |X| - \lambda O_k(X) \right)
$$

where $O_k(X)$ is the number of vertices in $X$ having an induced degree strictly greater than $k$ in the king graph. 

The main historical problem is $SATE(N) = S_{3,2}(N,N)$.

## Repo Structure

- `src/` : Core independent reference scorer and constructive proofs in Rust.
- `exact/` : Exact solvers (CP-SAT, MILP, Brute-Force) to find the absolute optima.
- `proofs/` : Mathematical proofs on asymptotic density and boundary terms.
- `witnesses/` : Certified optimal configurations.
- `data/` : CSV sequence of optima.
- `tests/` : Automated tests for cross-verification.
