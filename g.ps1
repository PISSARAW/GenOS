$cargo = (Get-Command cargo -ErrorAction SilentlyContinue).Source
if (-not $cargo) {
	$cargo = Join-Path $HOME '.cargo\bin\cargo.exe'
}
if (-not (Test-Path $cargo)) {
	throw "Cargo introuvable. Installez Rust ou ajoutez cargo.exe au PATH."
}
& $cargo run -q -p genos-simple-cli -- $args
