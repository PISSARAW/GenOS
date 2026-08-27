from .agent import Agent

class ObserverAgent(Agent):
    def __init__(self, name: str = "Observer"):
        super().__init__(name)

    def observe(self, event: str):
        print(f"[{self.name}] Observing event: {event}")
