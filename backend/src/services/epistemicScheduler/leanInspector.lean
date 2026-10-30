import Lean.Util.CollectAxioms
import Lean.Data.Json.FromToJson
import Lean.Util.Path

open Lean

instance : MonadEnv (StateT Environment IO) where
  getEnv := get
  modifyEnv := modify

-- Compiled independently of the candidate. Candidate stdout is never an audit.
def main (args : List String) : IO UInt32 := do
  let [moduleName, targetName] := args
    | throw <| IO.userError "Expected module and theorem names"
  initSearchPath (← findSysroot)
  let env ← importModules #[{ module := moduleName.toName }] {} 0
  let target := targetName.toName
  let some (.thmInfo _) := env.find? target
    | throw <| IO.userError "Target is not a theorem"
  let (axioms, _) ← (collectAxioms target : StateT Environment IO (Array Name)).run env
  let mut modules : Array Json := #[]
  for name in env.header.moduleNames do
    if name != moduleName.toName then
      modules := modules.push <| Json.mkObj [
        ("name", toJson name.toString), ("path", toJson (← findOLean name).toString)]
  IO.println <| (Json.mkObj [
    ("schema", toJson "genos.lean-audit/v1"),
    ("target", toJson targetName),
    ("axioms", toJson (axioms.map Name.toString)),
    ("modules", toJson modules)]).compress
  return 0
