import json
import random
import math

SIZE = 20

def get_neighbors(grid, x, y):
    count = 0
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            nx = x + dx
            ny = y + dy
            if 0 <= nx < SIZE and 0 <= ny < SIZE:
                count += grid[ny][nx]
    return count

def compute_fitness(grid):
    score = 0
    for y in range(SIZE):
        for x in range(SIZE):
            if grid[y][x] == 1:
                score += 1
                if get_neighbors(grid, x, y) > 3:
                    score -= 2
    return score

def main():
    dataset = []
    # Generer 100,000 grilles
    for _ in range(100000):
        # Pour coller au comportement de Delta-1 HashLife (25% en moyenne d'alive)
        grid = [[1 if random.random() < 0.25 else 0 for _ in range(SIZE)] for _ in range(SIZE)]
        score = compute_fitness(grid)
        # Valeur: probabilité mathématique (sigmoid) centrée sur 180
        val = 1.0 / (1.0 + math.exp(-(score - 180.0) / 10.0))
        
        dataset.append({
            "grid": grid,
            "Value": round(val, 6)
        })
        
    with open('data/dataset_rgol.json', 'w') as f:
        json.dump(dataset, f)

    print(f"Volume du dataset généré : {len(dataset)} configurations")

if __name__ == '__main__':
    main()
