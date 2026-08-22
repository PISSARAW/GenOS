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
    
    unvisited = set(range(1, n))
    route = [0]
    
    while unvisited:
        curr = route[-1]
        nxt = min(unvisited, key=lambda x: dist(cities[curr], cities[x]))
        route.append(nxt)
        unvisited.remove(nxt)
        
    return route

def reverse_segment(route: list[int], i: int, j: int) -> None:
    route[i:j+1] = reversed(route[i:j+1])

def get_delta(r: list[int], ij: tuple[int, int], cities: list[tuple[float, float]]) -> float:
    i, j = ij
    n = len(r)
    a, b = r[i - 1], r[i]
    c, d = r[j], r[(j + 1) % n]
    return dist(cities[a], cities[c]) + dist(cities[b], cities[d]) - (dist(cities[a], cities[b]) + dist(cities[c], cities[d]))

def optimize_loop(route: list[int], cities: list[tuple[float, float]], start_time: float) -> list[int]:
    n = len(cities)
    best_dist = total_dist(route, cities)
    current_dist = best_dist
    best_route = list(route)
    
    temp = 5000.0
    alpha = 0.99995
    min_temp = 1e-6
    iterations = 0
    
    # Memory mechanism (Tabu list)
    tabu_list = []
    tabu_tenure = 50
    
    # Counter for stagnation (reheating)
    stagnation = 0
    
    while temp > min_temp:
        iterations += 1
        if iterations % 500 == 0:
            if time.time() - start_time > 8.0:
                break
                
        i = random.randint(0, n - 1)
        j = random.randint(0, n - 1)
        if i == j or j - i == n - 1:
            continue
        if i > j:
            i, j = j, i
            
        delta = get_delta(route, (i, j), cities)
        
        # Check tabu
        city_pair = (min(route[i], route[j]), max(route[i], route[j]))
        is_tabu = city_pair in tabu_list
        
        # Aspiration criterion: if it improves best_dist, ignore tabu
        accept = False
        if delta < 0.0:
            if not is_tabu or (current_dist + delta < best_dist):
                accept = True
        elif random.random() < math.exp(-delta / temp):
            if not is_tabu:
                accept = True
                
        if accept:
            reverse_segment(route, i, j)
            current_dist += delta
            
            # Update memory
            tabu_list.append(city_pair)
            if len(tabu_list) > tabu_tenure:
                tabu_list.pop(0)
                
            if current_dist < best_dist:
                best_dist = current_dist
                best_route = list(route)
                stagnation = 0
            else:
                stagnation += 1
        else:
            stagnation += 1
            
        temp *= alpha
        
        # Reheat memory mechanism
        if stagnation > 10000:
            route = list(best_route)
            current_dist = best_dist
            temp *= 2.0
            stagnation = 0
            tabu_list.clear()
            
    return best_route

def solve(cities: list[tuple[float, float]]) -> float:
    n = len(cities)
    if n <= 3:
        return total_dist(list(range(n)), cities)
    
    start_time = time.time()
    route = init_route(cities)
    best_route = optimize_loop(route, cities, start_time)
        
    return total_dist(best_route, cities)
