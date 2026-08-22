import torch
import torch.nn as nn
from typing import List

class OracleNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.dense = nn.Linear(20, 16)
        self.out = nn.Linear(16, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        return self.sigmoid(self.out(torch.relu(self.dense(x))))

model = OracleNet()
model.eval()

def evaluate_branch(grid: List[int]) -> float:
    """
    Tabula Rasa: The Oracle evaluates the grid without modifying it.
    Returns a score between 0.0 and 1.0. Lower score means bad branch.
    """
    # Count population
    pop = sum(bin(row).count('1') for row in grid)
    if pop < 15 or pop > 80:
        return 0.1 # Very likely to die quickly or stabilize

    with torch.no_grad():
        t = torch.tensor(grid, dtype=torch.float32)
        score = model(t).item()
    
    # We add a heuristic to boost the score for grids with good population
    return max(score, 0.5)
