STRIDE = 100

def number(registry, a, b, t):
    # Dummy implementation
    return hash((a, b, t)) % 1000

def build_registry():
    return {"data": [1, 2, 3]}

def naive(pieces):
    out, n = {}, 0
    for p in pieces:
        for k in range(len(p["outline"])):
            out[f'{p["name"]}/e{k}'] = n
            n += STRIDE
    return out

def get_reader_value():
    return 42

def validate_geometry(geom):
    if not geom.get("valid"):
        raise ValueError("Invalid geometry")
    return True
