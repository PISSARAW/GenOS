import math
import random
import time

def dist(c1: tuple[float, float], c2: tuple[float, float]) -> float:
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])

def total_dist(route: list[int], cities: list[tuple[float, float]]) -> float:
    if not route:
        return 0.0
    return sum(dist(cities[route[i]], cities[route[(i + 1) % len(route)]]) for i in range(len(route)))

def init_route(cities: list[tuple[float, float]]) -> list[int]:
    n = len(cities)
    if n == 0:
        return []
    
    start_t = time.time()
    unvisited = set(range(1, n))
    route = [0]
    
    while unvisited:
        if time.time() - start_t > 1.0:
            route.extend(unvisited)
            break
            
        curr = route[-1]
        nxt = min(unvisited, key=lambda x: dist(cities[curr], cities[x]))
        route.append(nxt)
        unvisited.remove(nxt)
        
    return route

def solve(cities: list[tuple[float, float]]) -> float:
    n = len(cities)
    if n <= 3:
        return total_dist(list(range(n)), cities)
    
    start_time = time.time()
    route = init_route(cities)
    best_dist = total_dist(route, cities)
    current_dist = best_dist
    best_route = list(route)
    
    temp = 10000.0
    alpha = 0.99995
    min_temp = 1e-6
    iterations = 0
    
    while temp > min_temp:
        iterations += 1
        if iterations % 500 == 0:
            current_dist = total_dist(route, cities)
            if time.time() - start_time > 7.5:
                break
                
        i = random.randint(0, n - 1)
        j = random.randint(0, n - 1)
        if i == j:
            continue
        if i > j:
            i, j = j, i
            
        if j - i == n - 1:
            continue
            
        a, b = route[i - 1], route[i]
        c, d = route[j], route[(j + 1) % n]
        
        delta = dist(cities[a], cities[c]) + dist(cities[b], cities[d]) - (dist(cities[a], cities[b]) + dist(cities[c], cities[d]))
        
        if delta < 0.0 or random.random() < math.exp(-delta / temp):
            route[i:j+1] = reversed(route[i:j+1])
            current_dist += delta
            if current_dist < best_dist:
                best_dist = current_dist
                best_route = list(route)
                
        temp *= alpha
        
    return total_dist(best_route, cities)
