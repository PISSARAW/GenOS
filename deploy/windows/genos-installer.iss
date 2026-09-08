#define MyAppName "GenOS"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "GenOS Team"
#define MyAppURL "https://github.com/PISSARAW/GenOS"

[Setup]
AppId={{38429F86-6FA4-4EF3-8B7A-24E30BFC92D4}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\GenOS
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
OutputDir=Output
OutputBaseFilename=GenOS-V3-Setup
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\genos.exe
ChangesEnvironment=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\..\target\release\g.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\target\release\genos.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\target\release\genos-mcp.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\target\release\genos-api.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\.env.example"; DestDir: "{app}"; DestName: ".env.example"; Flags: ignoreversion

[Icons]
Name: "{group}\GenOS CLI (g)"; Filename: "{app}\g.exe"; Parameters: "--help"
Name: "{group}\GenOS Native (genos)"; Filename: "{app}\genos.exe"; Parameters: "--help"
Name: "{group}\GenOS Documentation"; Filename: "{app}\README.md"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autoprograms}\GenOS CLI"; Filename: "{app}\g.exe"

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; \
    ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; \
    Check: NeedsAddPath(ExpandConstant('{app}'))

[Run]
Filename: "{app}\g.exe"; Parameters: "--version"; Description: "Vérifier la version de GenOS"; Flags: runhidden waituntilterminated postinstall skipifsilent

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