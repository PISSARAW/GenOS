import pulp

size = 20
prob = pulp.LpProblem("MaxScore", pulp.LpMaximize)

grid = pulp.LpVariable.dicts("cell", ((y, x) for y in range(size) for x in range(size)), cat='Binary')
scores = pulp.LpVariable.dicts("score", ((y, x) for y in range(size) for x in range(size)), cat='Integer')

for y in range(size):
    for x in range(size):
        # count neighbors
        neighbors = []
        for dy in [-1, 0, 1]:
            for dx in [-1, 0, 1]:
                if dx == 0 and dy == 0: continue
                ny, nx = y + dy, x + dx
                if 0 <= ny < size and 0 <= nx < size:
                    neighbors.append(grid[ny, nx])
        
        # If grid[y,x] is 1 and sum(neighbors) <= 3, score is 1
        # If grid[y,x] is 1 and sum(neighbors) > 3, score is -1
        # If grid[y,x] is 0, score is 0
        
        # We can introduce a binary variable: over = 1 if sum(neighbors) >= 4, else 0
        over = pulp.LpVariable(f"over_{y}_{x}", cat='Binary')
        
        sum_n = pulp.lpSum(neighbors)
        # sum_n - 3 <= 8 * over
        prob += sum_n - 3 <= 8 * over
        # sum_n >= 4 * over
        prob += sum_n >= 4 * over
        
        # score[y,x] = grid[y,x] * (1 - 2*over)
        # score = grid - 2 * (grid AND over)
        # let both = grid AND over
        both = pulp.LpVariable(f"both_{y}_{x}", cat='Binary')
        prob += both <= grid[y,x]
        prob += both <= over
        prob += both >= grid[y,x] + over - 1
        
        prob += scores[y,x] == grid[y,x] - 2 * both

prob += pulp.lpSum(scores.values())

prob.solve()
print("Max score:", pulp.value(prob.objective))

# print grid
for y in range(size):
    row = ""
    for x in range(size):
        row += "1 " if pulp.value(grid[y,x]) > 0.5 else "0 "
    print(row)
