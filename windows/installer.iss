; Program de instalare pentru Regatul Cărților pe Windows (Inno Setup 6)
; Doar pentru utilizatorul curent, fără drepturi de administrator, ca actualizarea automată să meargă fără întrebări.

#define AppName "Regatul Cărților"
#define AppExe "RegatulCartilor.exe"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#if FileExists(AddBackslash(SourcePath) + "nvdaControllerClient32.dll")
  #define AreVoce
#endif

[Setup]
AppId={{6C2E9B41-7D3A-4F8E-9A15-2B4C8E7D1F60}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Răzvan
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename=RegatulCartilor-Setup
SetupIconFile=icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
CloseApplications=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
#if FileExists(AddBackslash(SourcePath) + "Romanian.isl")
Name: "ro"; MessagesFile: "Romanian.isl"
#endif

[CustomMessages]
en.ScurtaturaDesktop=Create a desktop shortcut
en.Scurtaturi=Shortcuts:
ro.ScurtaturaDesktop=Pune o scurtătură pe desktop
ro.Scurtaturi=Scurtături:

[Tasks]
Name: "desktopicon"; Description: "{cm:ScurtaturaDesktop}"; GroupDescription: "{cm:Scurtaturi}"

[Files]
Source: "out\*"; DestDir: "{app}"; Excludes: "*.pdb,*.xml"; Flags: ignoreversion recursesubdirs createallsubdirs
#ifdef AreVoce
Source: "nvdaControllerClient32.dll"; Flags: dontcopy
#endif

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{#AppName}"; Flags: nowait postinstall skipifsilent
Filename: "{app}\{#AppExe}"; Parameters: "--actualizat"; Flags: nowait; Check: IsAutoUpdate

[Code]
var
  UltimulSpus: Integer;
  Inceput: Integer;

#ifdef AreVoce
function nvdaController_speakText(Text: String): Integer;
  external 'nvdaController_speakText@files:nvdaControllerClient32.dll stdcall delayload';
function nvdaController_testIfRunning: Integer;
  external 'nvdaController_testIfRunning@files:nvdaControllerClient32.dll stdcall delayload';
#endif

procedure Spune(const T: String);
begin
#ifdef AreVoce
  try
    if nvdaController_testIfRunning = 0 then
      nvdaController_speakText(T);
  except
    Log('NVDA nu a putut vorbi: ' + GetExceptionMessage);
  end;
#endif
  Log('Spune: ' + T);
end;

{ Limba aleasa in aplicatie (limba.txt, scrisa de program); altfel limba installerului. }
function LimbaProgram: String;
var
  S: AnsiString;
begin
  if LoadStringFromFile(ExpandConstant('{localappdata}\Regatul Cartilor\limba.txt'), S) then
    Result := Lowercase(Trim(String(S)))
  else if ActiveLanguage = 'ro' then
    Result := 'ro'
  else
    Result := 'en';
end;

function TextLimba(const En, Ro, Es, Fr, De, It, Pt: String): String;
var
  L: String;
begin
  L := LimbaProgram;
  if L = 'ro' then Result := Ro
  else if L = 'es' then Result := Es
  else if L = 'fr' then Result := Fr
  else if L = 'de' then Result := De
  else if L = 'it' then Result := It
  else if L = 'pt' then Result := Pt
  else Result := En;
end;

procedure SpuneProcent(Procent: Integer);
var
  Zece: Integer;
begin
  if Procent > 99 then Procent := 99;
  Zece := (Procent div 10) * 10;
  if (Zece > UltimulSpus) and (Zece > 0) then
  begin
    UltimulSpus := Zece;
    Spune(Format(TextLimba('%d percent.', '%d la sută.', '%d por ciento.', '%d pour cent.', '%d Prozent.', '%d per cento.', '%d por cento.'), [Zece]));
  end;
end;

function IsAutoUpdate: Boolean;
begin
  Result := Pos('/AUTOUPDATE', Uppercase(GetCmdTail)) > 0;
end;

{ La actualizare asteptam (cel mult 30 de secunde) sa se inchida programul. }
function InitializeSetup: Boolean;
var
  I: Integer;
begin
  if IsAutoUpdate then
  begin
    I := 0;
    while CheckForMutexes('RegatulCartilorRuleaza') and (I < 60) do
    begin
      Sleep(500);
      I := I + 1;
    end;
  end;
  Result := True;
end;

{ WebView2 (motorul Edge in care se deschide aplicatia) e pe orice Windows 10 sau 11 la zi; daca lipseste, il instalam. }
function AreWebView2: Boolean;
var
  V: String;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'));
end;

procedure InstaleazaWebView2;
var
  Cod: Integer;
begin
  if AreWebView2 then exit;
  try
    WizardForm.StatusLabel.Caption := 'Microsoft Edge WebView2...';
    DownloadTemporaryFile('https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'MicrosoftEdgeWebview2Setup.exe', '', nil);
    Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'), '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Cod);
  except
    Log('WebView2 nu s-a putut instala: ' + GetExceptionMessage);
  end;
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
begin
  if MaxProgress > 0 then
    SpuneProcent(Inceput + Integer((Int64(CurProgress) * (99 - Inceput)) div MaxProgress));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
    if IsAutoUpdate then
      Inceput := 50
    else
    begin
      Inceput := 0;
      Spune(TextLimba('Installing.', 'Se instalează.', 'Instalando.', 'Installation.', 'Wird installiert.', 'Installazione in corso.', 'A instalar.'));
    end;
    UltimulSpus := Inceput;
  end;
  if CurStep = ssPostInstall then
    InstaleazaWebView2;
  if (CurStep = ssDone) and not IsAutoUpdate then
    Spune(TextLimba('100 percent. Installation complete.', '100 la sută. Instalare terminată.', '100 por ciento. Instalación terminada.', '100 pour cent. Installation terminée.',
                    '100 Prozent. Installation abgeschlossen.', '100 per cento. Installazione completata.', '100 por cento. Instalação concluída.'));
end;
