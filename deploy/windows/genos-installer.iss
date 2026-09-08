#define MyAppName "GenOS"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "GenOS"

[Setup]
AppId={{38429F86-6FA4-4EF3-8B7A-24E30BFC92D4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\GenOS
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=GenOS-Setup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\genos.exe

[Files]
Source: "..\..\target\release\genos.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\target\release\genos-mcp.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\GenOS CLI"; Filename: "{app}\genos.exe"

[Run]
Filename: "{app}\genos.exe"; Parameters: "--help"; Description: "Verify GenOS installation"; Flags: runhidden waituntilterminated postinstall skipifsilent