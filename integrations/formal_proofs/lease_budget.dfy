datatype Lease = Lease(actions: set<string>, budget: nat)

method Attenuate(parent: Lease, requested: set<string>, childBudget: nat) returns (child: Lease)
  requires requested <= parent.actions
  requires childBudget <= parent.budget
  ensures child.actions <= parent.actions
  ensures child.budget <= parent.budget
{
  child := Lease(requested, childBudget);
}

method Spend(remaining: nat, cost: nat) returns (next: nat)
  requires cost <= remaining
  ensures next + cost == remaining
  ensures next <= remaining
{
  next := remaining - cost;
}
