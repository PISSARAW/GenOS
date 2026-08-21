import sys
from ortools.sat.python import cp_model

def get_all_symmetries(grid_tuple, block_size):
    """
    Returns a set of all equivalent grids under D4 and Toroidal translations.
    grid_tuple is a tuple of tuples (booleans).
    """
    def translate(g, dx, dy):
        return tuple(
            tuple(g[(y + dy) % block_size][(x + dx) % block_size] for x in range(block_size))
            for y in range(block_size)
        )
        
    def rotate90(g):
        return tuple(
            tuple(g[block_size - 1 - x][y] for x in range(block_size))
            for y in range(block_size)
        )
        
    def reflect_h(g):
        return tuple(
            tuple(g[y][block_size - 1 - x] for x in range(block_size))
            for y in range(block_size)
        )

    symmetries = set()
    current = grid_tuple
    
    # Generate all D4 variants
    for _ in range(4):
        # Add all translations of current
        for dy in range(block_size):
            for dx in range(block_size):
                symmetries.add(translate(current, dx, dy))
                # Add reflection
                symmetries.add(translate(reflect_h(current), dx, dy))
        current = rotate90(current)
        
    return symmetries

def compute_stats(grid, block_size):
    degree_hist = {}
    has_empty_row = False
    has_empty_col = False
    num_empty_rows = 0
    num_empty_cols = 0
    empty_row_words = []
    
    # Empty rows
    for y in range(block_size):
        if sum(grid[y]) == 0:
            has_empty_row = True
            num_empty_rows += 1
            # Extract word
            word = []
            for x in range(block_size):
                ax = grid[(y + 1) % block_size][x]
                bx = grid[(y - 1 + block_size) % block_size][x]
                word.append(f"{ax}{bx}")
            empty_row_words.append(word)
            
    # Empty cols
    for x in range(block_size):
        if sum(grid[y][x] for y in range(block_size)) == 0:
            has_empty_col = True
            num_empty_cols += 1
            
    # IPW Phase 1 Simulation (Sides)
    # q0: +1 for empty, -1 for full
    # c(u): number of lateral full neighbors of empty cell u
    # q1: empty gives 1/c(u) to each lateral full neighbor if c(u)>0
    q1 = [[0.0]*block_size for _ in range(block_size)]
    for y in range(block_size):
        for x in range(block_size):
            if grid[y][x] == 0:
                lat_full = 0
                for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]:
                    nx, ny = (x + dx) % block_size, (y + dy) % block_size
                    if grid[ny][nx] == 1:
                        lat_full += 1
                if lat_full > 0:
                    q1[y][x] = 0.0 # gave away 1
                else:
                    q1[y][x] = 1.0 # kept 1
            else:
                q1[y][x] = -1.0
                
    for y in range(block_size):
        for x in range(block_size):
            if grid[y][x] == 0:
                lat_full = 0
                full_neighbors = []
                for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]:
                    nx, ny = (x + dx) % block_size, (y + dy) % block_size
                    if grid[ny][nx] == 1:
                        lat_full += 1
                        full_neighbors.append((nx, ny))
                if lat_full > 0:
                    for nx, ny in full_neighbors:
                        q1[ny][nx] += 1.0 / lat_full

    # Degrees
    dirs = [
        (-1, -1), (0, -1), (1, -1),
        (-1,  0),          (1,  0),
        (-1,  1), (0,  1), (1,  1),
    ]
    
    for y in range(block_size):
        for x in range(block_size):
            if grid[y][x]:
                deg = 0
                for dx, dy in dirs:
                    nx, ny = (x + dx) % block_size, (y + dy) % block_size
                    if grid[ny][nx]:
                        deg += 1
                degree_hist[deg] = degree_hist.get(deg, 0) + 1
                
    return {
        "hist": degree_hist,
        "has_empty_row": has_empty_row,
        "has_empty_col": has_empty_col,
        "num_empty_rows": num_empty_rows,
        "num_empty_cols": num_empty_cols,
        "has_empty_cross": has_empty_row and has_empty_col,
        "empty_row_words": empty_row_words,
        "q1": q1
    }

def explore_perfect_motifs(block_size, force_empty_row=False):
    model = cp_model.CpModel()
    
    grid = {}
    for y in range(block_size):
        for x in range(block_size):
            grid[(x, y)] = model.NewBoolVar(f'cell_{x}_{y}')
            
    dirs = [
        (-1, -1), (0, -1), (1, -1),
        (-1,  0),          (1,  0),
        (-1,  1), (0,  1), (1,  1),
    ]
    
    for y in range(block_size):
        for x in range(block_size):
            neighbors = [grid[((x + dx) % block_size, (y + dy) % block_size)] for dx, dy in dirs]
            degree = sum(neighbors)
            model.Add(degree <= 3).OnlyEnforceIf(grid[(x, y)])

    total_cells = block_size * block_size
    target_alive = total_cells // 2
    total_alive = sum(grid.values())
    model.Add(total_alive == target_alive)
    
    if force_empty_row:
        for x in range(block_size):
            model.Add(grid[(x, 0)] == 0)
    
    solver = cp_model.CpSolver()
    solver.parameters.enumerate_all_solutions = True
    
    all_solutions = []
    
    class SolutionCollector(cp_model.CpSolverSolutionCallback):
        def __init__(self, variables):
            cp_model.CpSolverSolutionCallback.__init__(self)
            self.variables = variables
            
        def on_solution_callback(self):
            sol = tuple(
                tuple(1 if self.Value(self.variables[(x, y)]) else 0 for x in range(block_size))
                for y in range(block_size)
            )
            all_solutions.append(sol)
            
    collector = SolutionCollector(grid)
    status = solver.Solve(model, collector)
    
    print(f"\n==========================================")
    print(f"RESULTS FOR T={block_size} (force_empty_row={force_empty_row})")
    print(f"==========================================")
    print(f"raw perfect motifs = {len(all_solutions)}")
    
    if len(all_solutions) == 0:
        return
        
    # Group into classes
    classes = [] # List of representatives
    seen = set()
    
    for sol in all_solutions:
        if sol not in seen:
            classes.append(sol)
            # Add all symmetries to seen
            syms = get_all_symmetries(sol, block_size)
            seen.update(syms)
            
    print(f"classes modulo translations+D4 = {len(classes)}\n")
    
    for i, rep in enumerate(classes):
        print(f"Class {chr(65 + i)}:")
        # Print grid
        for y in range(block_size):
            print("".join('#' if rep[y][x] else '.' for x in range(block_size)))
            
        stats = compute_stats(rep, block_size)
        print(f"degree histogram = {stats['hist']}")
        print(f"empty-row compatible = {'yes' if stats['has_empty_row'] else 'no'}")
        
        # Check if any symmetry has empty col
        has_empty_col_sym = any(compute_stats(sym, block_size)['has_empty_col'] for sym in get_all_symmetries(rep, block_size))
        print(f"empty-column compatible = {'yes (possibly after rotation)' if has_empty_col_sym else 'no'}")
        print(f"empty-cross compatible = {'yes' if stats['has_empty_cross'] else 'no'}")
        
        if stats['has_empty_row']:
            print(f"empty-row words (ax, bx): {stats['empty_row_words']}")
            # Find the empty row index to print q1
            for y in range(block_size):
                if sum(rep[y]) == 0:
                    print(f"IPW q1 values around empty row {y}:")
                    print(f"  row {y-1}: {[round(stats['q1'][(y-1)%block_size][x], 2) for x in range(block_size)]}")
                    print(f"  row {y} (empty): {[round(stats['q1'][y][x], 2) for x in range(block_size)]}")
                    print(f"  row {y+1}: {[round(stats['q1'][(y+1)%block_size][x], 2) for x in range(block_size)]}")
        
        print("")

if __name__ == '__main__':
    print("--- 1. GENERAL MOTIF EXPLORATION ---")
    explore_perfect_motifs(4, force_empty_row=False)
    
    print("--- 2. LINE RIGIDITY LEMMA EXPLORATION (Forced Empty Row 0) ---")
    explore_perfect_motifs(4, force_empty_row=True)
    explore_perfect_motifs(6, force_empty_row=True)
    # explore_perfect_motifs(8, force_empty_row=True)
    # explore_perfect_motifs(10, force_empty_row=True)
