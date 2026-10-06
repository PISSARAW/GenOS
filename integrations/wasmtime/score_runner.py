"""Execute a tiny, import-free WebAssembly scoring function with hard resource limits."""
from pathlib import Path


def run_score(module_path, value, fuel=100_000):
    from wasmtime import Config, Engine, Instance, Module, Store

    path = Path(module_path)
    if path.suffix != ".wasm" or path.stat().st_size > 1_000_000:
        raise ValueError("module must be a wasm file under 1 MiB")
    if type(value) is not int or not -(2 ** 31) <= value < 2 ** 31:
        raise ValueError("value must be i32")
    if type(fuel) is not int or not 1 <= fuel <= 10_000_000:
        raise ValueError("invalid fuel budget")
    config = Config()
    config.consume_fuel = True
    engine = Engine(config)
    module = Module(engine, path.read_bytes())
    if module.imports:
        raise ValueError("host imports are forbidden")
    store = Store(engine)
    store.set_limits(memory_size=1_048_576, instances=1, tables=0, memories=1)
    store.set_fuel(fuel)
    instance = Instance(store, module, [])
    score = instance.exports(store).get("score")
    if score is None:
        raise ValueError("score export is required")
    result = score(store, value)
    if type(result) is not int:
        raise ValueError("score must return i32")
    return {"result": result, "fuel_used": fuel - store.get_fuel()}
