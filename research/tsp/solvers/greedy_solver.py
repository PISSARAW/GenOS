import math

def get_dist(c1: tuple[float, float], c2: tuple[float, float]) -> float:
    """Calculate Euclidean distance between two cities."""
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])

def get_nearest(curr: tuple[float, float], unvisited: set[int], cities: list[tuple[float, float]]) -> tuple[int, float]:
    """Find the nearest unvisited city to the current city."""
    min_dist = float('inf')
    nearest_idx = -1
    
    for idx in unvisited:
        dist = get_dist(curr, cities[idx])
        if dist < min_dist:
            min_dist = dist
            nearest_idx = idx
            
    return nearest_idx, min_dist

def solve(cities: list[tuple[float, float]]) -> float:
    """
    Solve TSP using a greedy algorithm.
    Returns the total distance of the closed path.
    """
    if not cities or len(cities) <= 1:
        return 0.0

    unvisited = set(range(1, len(cities)))
    current_idx = 0
    total_dist = 0.0

    while unvisited:
        curr_city = cities[current_idx]
        next_idx, dist = get_nearest(curr_city, unvisited, cities)
        
        total_dist += dist
        current_idx = next_idx
        unvisited.remove(next_idx)

    # Return to the starting city (index 0)
    total_dist += get_dist(cities[current_idx], cities[0])

    return total_dist
