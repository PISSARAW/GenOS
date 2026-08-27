class CostAccounting:
    def __init__(self, budget_limit=100.0):
        self.budget_limit = budget_limit
        self.current_cost = 0.0
        self.transactions = []

    def add_cost(self, amount, description=""):
        if amount < 0:
            raise ValueError("Cost amount must be positive.")
        if self.current_cost + amount > self.budget_limit:
            raise RuntimeError("Budget limit exceeded.")
        
        self.current_cost += amount
        self.transactions.append({"amount": amount, "description": description})
        return self.current_cost

    def get_remaining_budget(self):
        return self.budget_limit - self.current_cost

    def generate_report(self):
        return {
            "budget_limit": self.budget_limit,
            "current_cost": self.current_cost,
            "transactions": self.transactions
        }
