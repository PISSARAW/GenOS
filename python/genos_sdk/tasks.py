from typing import Callable, Any

class DeterministicTask:
    def __init__(self, name: str, func: Callable):
        self.name = name
        self.func = func

    def execute(self, *args, **kwargs) -> Any:
        return self.func(*args, **kwargs)

class HumanApprovalTask:
    def __init__(self, name: str):
        self.name = name

    def execute(self) -> bool:
        response = input(f"Task '{self.name}' requires human approval. Approve? (y/n): ")
        return response.strip().lower() == 'y'
