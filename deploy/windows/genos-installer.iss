#define MyAppName "GenOS"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "GenOS Team"
#define MyAppURL "https://github.com/GenOS"
#define MyAppExeName "genos.exe"

[Setup]
AppId={{D377B8A9-9C6E-4F3A-B6A0-1A8F53B7F5E5}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=GenOS-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
; Image inside the installer
WizardImageFile=..\..\assets\brand\genos-logo.bmp
; Icon of the installer .exe file
SetupIconFile=..\..\assets\brand\genos-logo.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "envPath"; Description: "Add GenOS to system PATH (Recommended)"; Flags: unchecked

[Files]
Source: "..\..\target\release\genos.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\..\target\release\genos-mcp.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\..\*.mjs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\backend\*"; DestDir: "{app}\backend"; Excludes: "*.db,*.db-shm,*.db-wal,*.log"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; Add bin folder to system PATH
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; \
    Tasks: envPath; Check: NeedsAddPath(ExpandConstant('{app}\bin'))

; Configure internal GenOS variables globally
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: string; ValueName: "GENOS_ORCHESTRATOR_BRIDGE"; ValueData: "{app}\orchestrator_cli.mjs"
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: string; ValueName: "GENOS_BIN"; ValueData: "{app}\bin\genos.exe"

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;
