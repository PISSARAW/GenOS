# Préflight Rust Windows

Le script [`scripts/ci/rust-test.ps1`](../../scripts/ci/rust-test.ps1) vérifie les
préconditions du chemin `windows-msvc` avant de lancer Cargo :

- `cl.exe` doit provenir des Build Tools MSVC avec le composant
  `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` ;
- `nasm.exe` est obligatoire pour les builds release utilisant `aws-lc-sys` ;
- `CARGO_BUILD_JOBS=1` est appliqué par défaut pour éviter les collisions
  d'archives natives (`LNK1114`).

Depuis une PowerShell ordinaire, le script tente d'importer automatiquement
l'environnement d'un Visual Studio installé via `vswhere.exe`. Cette importation
ne télécharge rien et échoue proprement si les Build Tools sont absents.

Pour installer NASM localement, utilisez le bootstrap explicite :

```powershell
.\scripts\ci\install-nasm.ps1 -Install -Yes
```

Le script détecte d'abord une installation existante. Avec `-Install -Yes`, il
choisit `winget` puis `Chocolatey` et affiche le gestionnaire utilisé. Sans ces
deux options, il ne télécharge rien et retourne un code d'absence. Le choix peut
être imposé avec `-PackageManager winget` ou `-PackageManager choco`.

```powershell
./scripts/ci/rust-test.ps1 --workspace
```

Un test debug sans NASM est possible uniquement avec `GENOS_ALLOW_NO_NASM=1`.
Il active explicitement `AWS_LC_SYS_NO_ASM=1` et ne constitue pas une
validation release. La CI Windows installe NASM et exécute le même préflight
avec MSVC disponible.
