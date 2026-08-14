# Model reproducibility demo

Demonstrates the offline test providers:

- `FakeModel`: `INPUT A` → `RESPONSE A`.
- `RandomModel(42)`: stable output across runs with the same seed.
- `RandomModel(99)`: a controlled functional divergence.

Run it with:

```powershell
cargo run -p genos-model --example reproducibility_demo
```
