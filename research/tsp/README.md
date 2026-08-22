# TSP Optimization Experiment

## Goal
Solve the Traveling Salesperson Problem (TSP) by finding the shortest path that connects a set of 100 cities.

## Dataset
The dataset is evaluated dynamically in `solvers/tsp_evaluator.py`. The
algorithm should expect a list of `(x, y)` tuples and return the shortest
distance found.

The historical CSV is not distributed in this repository. Pass its path
explicitly; the evaluator no longer depends on a contributor-specific absolute
Windows path.

## Forks

### Fork A: Greedy Algorithm
- **File**: `greedy_solver.py`
- **Implementation Details**: Implement a Greedy nearest-neighbor algorithm. Start at the first city, then iteratively go to the closest unvisited city, and finally return to the start.
- **Run Command**: `python solvers/tsp_evaluator.py /path/to/tsp_instances_dataset.csv solvers/greedy_solver.py`

### Fork B: Simulated Annealing
- **File**: `sa_solver.py`
- **Implementation Details**: Implement a Simulated Annealing algorithm to optimize the route. Ensure that it returns the shortest route found within roughly 5-8 seconds to avoid hitting the 10-second timeout of the evaluator.
- **Run Command**: `python solvers/tsp_evaluator.py /path/to/tsp_instances_dataset.csv solvers/sa_solver.py`

### Fork C: Genetic Algorithm
- **File**: `ga_solver.py`
- **Implementation Details**: Implement a Genetic Algorithm with a population of valid routes, crossover (e.g., Order Crossover), and mutation (e.g., Swap or Inversion). Optimize over several generations within an 8-second execution limit.
- **Run Command**: `python solvers/tsp_evaluator.py /path/to/tsp_instances_dataset.csv solvers/ga_solver.py`

## Evaluation
- Each branch will output the final distance as `EVAL_DISTANCE: <distance>`.
- The evaluation objective is to **MINIMIZE** the `EVAL_DISTANCE`.
- Compare the outcomes and merge the fork that achieved the lowest distance within the 10-second time limit into the main workspace.
