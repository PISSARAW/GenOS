class Swarm:
    def __init__(self):
        self.nodes = {}
        self.edges = {}

    def add_nodes(self, *nodes):
        for node in nodes:
            self.nodes[node.name] = node
            self.edges[node.name] = []

    def link(self, source_name: str, target_name: str):
        if source_name in self.nodes and target_name in self.nodes:
            self.edges[source_name].append(target_name)
        else:
            raise ValueError("Both source and target must be added to the swarm before linking.")

    def execute(self, start_node_name: str, *args, **kwargs):
        if start_node_name not in self.nodes:
            raise ValueError(f"Start node {start_node_name} not found in swarm.")
        
        current_node_name = start_node_name
        
        while current_node_name:
            node = self.nodes[current_node_name]
            
            # Execute node logic if it has an execute method
            if hasattr(node, 'execute'):
                result = node.execute(*args, **kwargs)
                if isinstance(result, bool) and not result:
                    print(f"Execution stopped at {current_node_name}.")
                    break
            
            # Move to next node (simple linear execution for now)
            next_nodes = self.edges.get(current_node_name, [])
            if not next_nodes:
                break
            current_node_name = next_nodes[0] # taking the first linked node
