import time
import random
import math

def calc_dist(c1: tuple[float, float], c2: tuple[float, float]) -> float:
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])

def build_matrix(cities: list[tuple[float, float]]) -> list[list[float]]:
    n = len(cities)
    mat = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = calc_dist(cities[i], cities[j])
            mat[i][j] = d
            mat[j][i] = d
    return mat

def path_dist(route: list[int], dist_matrix: list[list[float]]) -> float:
    dist = 0.0
    n = len(route)
    for i in range(n):
        dist += dist_matrix[route[i]][route[(i + 1) % n]]
    return dist

def create_pop(num_cities: int, pop_size: int) -> list[list[int]]:
    pop = []
    base_route = list(range(num_cities))
    for _ in range(pop_size):
        route = base_route[:]
        random.shuffle(route)
        pop.append(route)
    return pop

def crossover(p1: list[int], p2: list[int]) -> list[int]:
    n = len(p1)
    start, end = sorted([random.randrange(n), random.randrange(n)])
    child = [-1] * n
    
    for i in range(start, end):
        child[i] = p1[i]
        
    child_set = set(child[start:end])
    p2_filtered = [val for val in p2 if val not in child_set]
    
    p2_idx = 0
    for i in range(n):
        if child[i] == -1:
            child[i] = p2_filtered[p2_idx]
            p2_idx += 1
            
    return child

def mutate(route: list[int], mut_rate: float) -> list[int]:
    if random.random() < mut_rate:
        i, j = random.randrange(len(route)), random.randrange(len(route))
        route[i], route[j] = route[j], route[i]
    return route

def tournament(pop: list[list[int]], dists: list[float], k: int) -> list[int]:
    best_idx = -1
    best_dist = float('inf')
    n = len(pop)
    for _ in range(k):
        idx = random.randrange(n)
        if dists[idx] < best_dist:
            best_dist = dists[idx]
            best_idx = idx
    return pop[best_idx]

def evolve(pop: list[list[int]], dist_mat: list[list[float]], best_dist: float) -> float:
    dists = [path_dist(ind, dist_mat) for ind in pop]
    min_dist = min(dists)
    
    if min_dist < best_dist:
        best_dist = min_dist
        
    new_pop = []
    best_idx = dists.index(min_dist)
    new_pop.append(pop[best_idx][:])
    
    pop_size = len(pop)
    while len(new_pop) < pop_size:
        p1 = tournament(pop, dists, 3)
        p2 = tournament(pop, dists, 3)
        child = crossover(p1, p2)
        child = mutate(child, 0.1)
        new_pop.append(child)
        
    pop[:] = new_pop
    return best_dist

def solve(cities: list[tuple[float, float]]) -> float:
    if not cities or len(cities) <= 1:
        return 0.0
        
    start_t = time.time()
    dist_mat = build_matrix(cities)
    n = len(cities)
    
    pop_size = max(50, min(100, n * 2))
    pop = create_pop(n, pop_size)
    best_dist = float('inf')
    
    while time.time() - start_t < 7.5:
        best_dist = evolve(pop, dist_mat, best_dist)
        
    return best_dist
