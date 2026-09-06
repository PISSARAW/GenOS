@echo off
where cargo >nul 2>&1
if errorlevel 1 (
	set "CARGO=%USERPROFILE%\.cargo\bin\cargo.exe"
	if not exist "%CARGO%" (
		echo Cargo introuvable. Installez Rust ou ajoutez cargo.exe au PATH.
		exit /b 1
	)
) else (
	set "CARGO=cargo"
)
"%CARGO%" run -q -p genos-simple-cli -- %*
