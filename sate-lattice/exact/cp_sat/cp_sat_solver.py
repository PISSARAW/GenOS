import sys
from ortools.sat.python import cp_model

def solve_sate_lattice(n, strict=False):
    model = cp_model.CpModel()
    
    # grid[y][x] is 1 if cell is selected
    grid = {}
    for y in range(n):
        for x in range(n):
            grid[(x, y)] = model.NewBoolVar(f'cell_{x}_{y}')
            
    # overloaded[y][x] is 1 if cell is selected AND its induced degree is > 3
    overloaded = {}
    
    # Set up neighborhood constraints
    dirs = [
        (-1, -1), (0, -1), (1, -1),
        (-1,  0),          (1,  0),
        (-1,  1), (0,  1), (1,  1),
    ]
    
    for y in range(n):
        for x in range(n):
            neighbors = []
            for dx, dy in dirs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < n and 0 <= ny < n:
                    neighbors.append(grid[(nx, ny)])
                    
            degree = sum(neighbors)
            overloaded[(x, y)] = model.NewBoolVar(f'ov_{x}_{y}')
            
            # If grid[(x,y)] == 0, then overloaded[(x,y)] must be 0
            model.AddImplication(overloaded[(x, y)], grid[(x, y)])
            
            # If strictly solving D_3, no overloads allowed
            if strict:
                model.Add(overloaded[(x, y)] == 0)
                model.Add(degree <= 3).OnlyEnforceIf(grid[(x, y)])
            else:
                # b_degree_gt_3 is true iff degree >= 4
                b_degree_gt_3 = model.NewBoolVar(f'dgt3_{x}_{y}')
                model.Add(degree >= 4).OnlyEnforceIf(b_degree_gt_3)
                model.Add(degree <= 3).OnlyEnforceIf(b_degree_gt_3.Not())
                
                # overloaded is true iff (cell is active AND degree > 3)
                model.AddMultiplicationEquality(overloaded[(x,y)], [grid[(x,y)], b_degree_gt_3])

    total_alive = sum(grid.values())
    total_overloads = sum(overloaded.values())
    
    if strict:
        model.Maximize(total_alive)
    else:
        model.Maximize(total_alive - 2 * total_overloads)
        
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 8
    
    status = solver.Solve(model)
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        score = int(solver.ObjectiveValue())
        alive_count = int(solver.Value(total_alive))
        overload_count = int(solver.Value(total_overloads))
        
        # print grid
        for y in range(n):
            row = []
            for x in range(n):
                if solver.Value(grid[(x, y)]):
                    row.append('#')
                else:
                    row.append('.')
            print("".join(row))
            
        print(f"N={n}, Score={score}, Alive={alive_count}, Overloaded={overload_count}")
        return score, alive_count, overload_count
    else:
        print(f"No solution found for N={n}")
        return -1, -1, -1

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python cp_sat_solver.py <N> [strict]")
        sys.exit(1)
        
    n = int(sys.argv[1])
    strict = len(sys.argv) > 2 and sys.argv[2] == 'strict'
    
    solve_sate_lattice(n, strict)
