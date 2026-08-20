from z3 import *
import time

def prouver_limite_entropie():
    print("[Omega] Initialisation du solveur SAT Z3...")
    s = Solver()
    
    # Trackers pour isoler le coeur UNSAT
    s.set(unsat_core=True)

    # Grille 20x20
    N = 20
    X = [[Bool(f"x_{i}_{j}") for j in range(N)] for i in range(N)]

    # Contraintes d'entropie (ENTROPY_CONFRONTATION_TRUE)
    # Règle : Une cellule active ne peut pas être entourée UNIQUEMENT de cellules actives.
    # Elle a besoin d'au moins un voisin à 0 pour "respirer" (puits d'entropie).
    for i in range(N):
        for j in range(N):
            voisins = []
            if i > 0: voisins.append(X[i-1][j])
            if i < N-1: voisins.append(X[i+1][j])
            if j > 0: voisins.append(X[i][j-1])
            if j < N-1: voisins.append(X[i][j+1])
            
            # Si la cellule est à 1, au moins un voisin doit être à 0 (Not(And(tous_les_voisins)))
            clause_entropie = Implies(X[i][j], Not(And(voisins)))
            s.assert_and_track(clause_entropie, f"Entropie_{i}_{j}")

    # Forcer l'objectif "400" (Toutes les cellules à 1)
    for i in range(N):
        for j in range(N):
            s.assert_and_track(X[i][j] == True, f"Objectif_400_{i}_{j}")

    print("[Omega] Vérification de la satisfaisabilité (400) sur une topologie plate...")
    resultat = s.check()
    
    if resultat == unsat:
        print("[Omega] Résultat : UNSAT. Le 400 est mathématiquement impossible.")
        core = s.unsat_core()
        print(f"[Omega] Extraction du Coeur UNSAT (Clauses conflictuelles directes) :")
        for clause in core:
            if str(clause).startswith("Entropie"):
                print(f"  -> {clause}")
        
        print("\n[Omega] Explication : Les contraintes d'entropie aux bords (notamment les coins) "
              "ne peuvent pas dissiper l'entropie vers l'extérieur (pas de tore). "
              "Forcer 400 crée un conflit immédiat sur ces nœuds.")
    else:
        print("[Omega] Erreur logique : Le problème devrait être UNSAT.")

if __name__ == "__main__":
    prouver_limite_entropie()
