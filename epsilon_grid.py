def initialize_grid(size: int) -> list:
    """Initialise une grille 2D avec des bords connus et un centre inconnu (-1)."""
    grid = [[-1 for _ in range(size)] for _ in range(size)]
    for i in range(size):
        grid[0][i] = i % 2
        grid[i][0] = i % 2
    return grid

def deduce_state(top: int, left: int) -> int:
    """Déduit l'état causal selon les voisins (règle déterministe stricte)."""
    if top == -1 or left == -1:
        return -1
    return (top + left) % 2

def process_grid(grid: list, max_entropy: int) -> tuple:
    """Parcourt la grille et s'arrête si le puits d'entropie bloque la déduction."""
    size = len(grid)
    deduced = 0
    
    for i in range(1, size):
        for j in range(1, size):
            if i + j > max_entropy:
                return grid, deduced, (i, j)
            
            grid[i][j] = deduce_state(grid[i-1][j], grid[i][j-1])
            deduced += 1
            
    return grid, deduced, (-1, -1)

def main():
    size = 20
    entropy_limit = 15 # Arbitrary limit where entropy blocks deduction
    
    grid = initialize_grid(size)
    grid, count, blocked_at = process_grid(grid, entropy_limit)
    
    print(f"Pixels déduits avec succès : {count}")
    if blocked_at != (-1, -1):
        print(f"Puits d'entropie atteint. Blocage en : {blocked_at}")

if __name__ == '__main__':
    main()
