import sys
import csv
import time
import importlib.util
from pathlib import Path

def get_100_cities(file_path):
    # Extracts the first 100 cities from the att532 instance as an example, 
    # or parses a 100-city instance if available.
    cities = []
    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            # We look for a row with at least 100 cities.
            # Row format: TSP_Instance,Num_Cities,Total_Distance,Best_Route_Category,City_1_X,City_1_Y,...
            num_cities = int(row[1])
            if num_cities >= 100:
                # Extract first 100 cities
                for i in range(100):
                    x_idx = 4 + (i * 2)
                    y_idx = x_idx + 1
                    try:
                        x = float(row[x_idx])
                        y = float(row[y_idx])
                        cities.append((x, y))
                    except (IndexError, ValueError):
                        pass
                if len(cities) == 100:
                    return cities
                else:
                    cities = [] # Reset if we couldn't get 100
    return None

def main():
    if len(sys.argv) != 3:
        print("Usage: python tsp_evaluator.py <dataset.csv> <solver_script.py>")
        sys.exit(1)

    dataset_path = sys.argv[1]
    solver_path = sys.argv[2]
    module_name = Path(solver_path).stem
    
    spec = importlib.util.spec_from_file_location(module_name, solver_path)
    solver_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(solver_module)
    
    cities = get_100_cities(dataset_path)
    if not cities:
        print("Error: Could not extract 100 cities from the dataset.")
        sys.exit(1)

    start_time = time.time()
    try:
        # The solver must have a 'solve' function taking a list of (x,y) tuples
        distance = solver_module.solve(cities)
    except Exception as e:
        print(f"Error executing solver: {e}")
        distance = float('inf')
        
    elapsed = time.time() - start_time
    
    # We enforce a time limit of 10 seconds for example
    if elapsed > 10.0:
        print(f"Solver exceeded time limit (10s). Took {elapsed:.2f}s")
        distance = float('inf')
        
    # GenOS evaluators generally look for a metric to minimize/maximize in stdout
    print(f"EVAL_DISTANCE: {distance}")
    print(f"EVAL_TIME: {elapsed:.2f}s")
    sys.exit(0)

if __name__ == "__main__":
    main()
