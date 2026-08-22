import sys
import time
import csv
from ortools.sat.python import cp_model

def get_torus_bound(n):
    return ((n + 1) ** 2) // 2

def add_lex_less_eq(model, A, B):
    """Enforce A <=_lex B for boolean arrays."""
    n = len(A)
    prefixes = []
    for i in range(n):
        if i == 0:
            model.AddImplication(A[0], B[0]) # A[0] <= B[0]
            e = model.NewBoolVar(f'lex_e_{id(A)}_{i}')
            model.Add(A[0] == B[0]).OnlyEnforceIf(e)
            model.Add(A[0] != B[0]).OnlyEnforceIf(e.Not())
            prefixes.append(e)
        else:
            # If all prefixes match, A[i] <= B[i]
            model.AddImplication(A[i], B[i]).OnlyEnforceIf(prefixes[-1])
            
            e_curr = model.NewBoolVar(f'lex_ecurr_{id(A)}_{i}')
            eq_i = model.NewBoolVar(f'lex_eq_{id(A)}_{i}')
            model.Add(A[i] == B[i]).OnlyEnforceIf(eq_i)
            model.Add(A[i] != B[i]).OnlyEnforceIf(eq_i.Not())
            
            # e_curr is true iff (prefixes[-1] AND eq_i)
            model.AddBoolAnd([prefixes[-1], eq_i]).OnlyEnforceIf(e_curr)
            model.AddBoolOr([prefixes[-1].Not(), eq_i.Not()]).OnlyEnforceIf(e_curr.Not())
            prefixes.append(e_curr)

def solve_sate_lattice_targeted(n, target_score, mode="brute"):
    # mode can be "brute", "force-symmetric", "d4-lex"
    model = cp_model.CpModel()
    
    grid = {}
    for y in range(n):
        for x in range(n):
            grid[(x, y)] = model.NewBoolVar(f'cell_{x}_{y}')
            
    if mode == "force-symmetric":
        for y in range(n):
            for x in range(n):
                model.Add(grid[(x, y)] == grid[(n - 1 - x, y)])
                model.Add(grid[(x, y)] == grid[(x, n - 1 - y)])
                
    elif mode == "d4-lex":
        # Flat array standard: row by row
        base = [grid[(x, y)] for y in range(n) for x in range(n)]
        
        # 7 other symmetries
        syms = [
            # Rotations
            [grid[(n-1-y, x)] for y in range(n) for x in range(n)], # 90
            [grid[(n-1-x, n-1-y)] for y in range(n) for x in range(n)], # 180
            [grid[(y, n-1-x)] for y in range(n) for x in range(n)], # 270
            # Reflections
            [grid[(n-1-x, y)] for y in range(n) for x in range(n)], # Horizontal
            [grid[(x, n-1-y)] for y in range(n) for x in range(n)], # Vertical
            [grid[(y, x)] for y in range(n) for x in range(n)], # Diagonal 1
            [grid[(n-1-y, n-1-x)] for y in range(n) for x in range(n)], # Diagonal 2
        ]
        
        for sym_array in syms:
            add_lex_less_eq(model, base, sym_array)

    # Neighborhood constraints
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
            # Strict mode: no overload
            model.Add(degree <= 3).OnlyEnforceIf(grid[(x, y)])

    total_alive = sum(grid.values())
    model.Add(total_alive >= target_score)
        
    solver = cp_model.CpSolver()
    solver.parameters.num_search_workers = 8
    solver.parameters.max_time_in_seconds = 300.0
    
    start_time = time.time()
    status = solver.Solve(model)
    wall_time = time.time() - start_time
    
    branches = solver.NumBranches()
    conflicts = solver.NumConflicts()
    
    solution_grid = None
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        solution_grid = []
        for y in range(n):
            row = []
            for x in range(n):
                row.append('#' if solver.Value(grid[(x, y)]) else '.')
            solution_grid.append("".join(row))
            
    return status, wall_time, branches, conflicts, solution_grid

def run_experiments():
    mode = "brute"
    if "--force-symmetric" in sys.argv:
        mode = "force-symmetric"
    elif "--d4-lex" in sys.argv:
        mode = "d4-lex"
        
    csv_file = "e0002_results.csv"
    with open(csv_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["N", "N_mod_4", "U", "query_threshold", "status", "wall_time", "branches", "conflicts", "mode", "is_positive_control"])
    
    print(f"Starting E0002 CP-SAT Experiments (Mode: {mode})")
    
    for n in range(1, 26, 2):
        u_n = get_torus_bound(n)
        mod4 = n % 4
        
        conjectured_val = (u_n - 1) if mod4 == 1 else (u_n - 2)
        
        # 1. Positive control: Query >= conjectured_val (Should be SAT)
        print(f"N={n} (+Control): Querying >= {conjectured_val}... ", end="", flush=True)
        status_pos, t_pos, b_pos, c_pos, grid_pos = solve_sate_lattice_targeted(n, conjectured_val, mode)
        status_str_pos = solver_status_to_str(status_pos)
        print(f"{status_str_pos} in {t_pos:.2f}s")
        
        with open(csv_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([n, mod4, u_n, conjectured_val, status_str_pos, t_pos, b_pos, c_pos, mode, True])
            
        # 2. Main target query: Query >= conjectured_val + 1 (Should be UNSAT)
        target = conjectured_val + 1
        print(f"N={n} (Target)  : Querying >= {target}... ", end="", flush=True)
        status, t, b, c, grid = solve_sate_lattice_targeted(n, target, mode)
        status_str = solver_status_to_str(status)
        print(f"{status_str} in {t:.2f}s")
        
        with open(csv_file, 'a', newline='') as f:
            writer = csv.writer(f)
            writer.writerow([n, mod4, u_n, target, status_str, t, b, c, mode, False])
            
        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            # We found a counter-example!
            witness_file = f"witness_counterexample_N{n}.txt"
            with open(witness_file, "w") as wf:
                wf.write("\n".join(grid))
            print(f"!!! CONJECTURE FAILED FOR N={n} !!!")
            print(f"Witness saved to {witness_file}")
            print("Please run this witness through the Rust oracle.")

def solver_status_to_str(status):
    if status == cp_model.OPTIMAL: return "OPTIMAL"
    if status == cp_model.FEASIBLE: return "FEASIBLE"
    if status == cp_model.INFEASIBLE: return "INFEASIBLE"
    if status == cp_model.MODEL_INVALID: return "INVALID"
    if status == cp_model.UNKNOWN: return "UNKNOWN"
    return "ERROR"

if __name__ == '__main__':
    run_experiments()
