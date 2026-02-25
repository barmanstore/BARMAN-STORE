; Inno Setup Script - Starter for BARMAN STORE REACT
; Build frontend first: npm run build
; This installer packages the project so it can be run with Node.js on the target machine.
; Requires Node.js + npm to be installed on target machine.

#define MyAppName "BARMAN STORE REACT"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Barman Store"
#define MyAppURL "https://example.local"
#define MyAppExeName "run.bat"

[Setup]
AppId={{C85C8B8F-4C2E-4F32-8C4F-AB1D50CF9B74}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\BarmanStoreReact
DefaultGroupName=Barman Store React
DisableProgramGroupPage=yes
LicenseFile=
OutputDir=.
OutputBaseFilename=Setup_BarmanStoreReact
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked
Name: "runinstall"; Description: "Install npm dependencies after setup (recommended)"; GroupDescription: "Post-install:"; Flags: checkedonce

[Files]
; Runtime assets
Source: "dist\*"; DestDir: "{app}\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs

; App metadata and scripts
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "package-lock.json"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "run.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "setup.bat"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: ".env.example"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

; Optional files commonly useful in your repo
Source: "index.html"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "vite.config.js"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\Barman Store React"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall Barman Store React"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Barman Store React"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Optional dependency install step on target machine
Filename: "cmd.exe"; Parameters: "/c npm install"; WorkingDir: "{app}"; Flags: runhidden; Tasks: runinstall

; Launch app after install (opens run.bat)
Filename: "{app}\{#MyAppExeName}"; Description: "Launch Barman Store React"; Flags: nowait postinstall skipifsilent
