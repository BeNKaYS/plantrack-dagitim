; Plantrack — Windows kurulum paketi (Inno Setup 6)
; GitHub Actions (windows-latest) üzerinde derlenir: .github/workflows/windows.yml
; Elle derleme:  iscc /DSurum=10.2 /DKaynak=C:\plantrack-dagitim kurulum\windows\plantrack.iss
;
; Kurulum yönetici izni istemez. Dosyalar %LOCALAPPDATA%\Plantrack\kaynak altına açılır,
; ardından kurulum/kur.js çalışır: ~/PlantrackMCP hazırlanır, VERİLERE DOKUNULMAZ,
; isteğe bağlı olarak AI asistanlarına (Claude, Cursor, Gemini) MCP kaydı yapılır.

#ifndef Surum
  #define Surum "0.0"
#endif
#ifndef Kaynak
  #define Kaynak "..\.."
#endif

[Setup]
AppId={{6F1B6C1E-4B0A-4C1D-9A3E-5D2C7A1B0F01}
AppName=Plantrack
AppVersion={#Surum}
AppPublisher=Plantrack
DefaultDirName={localappdata}\Plantrack\kaynak
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputBaseFilename=Plantrack-Setup-{#Surum}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Plantrack {#Surum}
#ifdef Ikon
SetupIconFile={#Ikon}
#endif

[Languages]
Name: "tr"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "mcp"; Description: "AI asistanlarına bağla (Claude Desktop, Cursor, Gemini — ayarlar yedeklenir)"
Name: "masaustu"; Description: "Masaüstüne Plantrack kısayolu"

[Files]
Source: "{#Kaynak}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion; Excludes: ".git,.github"

[Icons]
Name: "{userprograms}\Plantrack"; Filename: "{%USERPROFILE}\PlantrackMCP\Plantrack.cmd"; WorkingDir: "{%USERPROFILE}\PlantrackMCP"
Name: "{userdesktop}\Plantrack"; Filename: "{%USERPROFILE}\PlantrackMCP\Plantrack.cmd"; WorkingDir: "{%USERPROFILE}\PlantrackMCP"; Tasks: masaustu

[Run]
Filename: "{cmd}"; Parameters: "/c node ""{app}\kurulum\kur.js"" --evet --masaustu-yok"; StatusMsg: "Plantrack hazırlanıyor..."; Flags: runhidden waituntilterminated; Tasks: mcp
Filename: "{cmd}"; Parameters: "/c node ""{app}\kurulum\kur.js"" --evet --mcp-yok --masaustu-yok"; StatusMsg: "Plantrack hazırlanıyor..."; Flags: runhidden waituntilterminated; Tasks: not mcp
Filename: "{%USERPROFILE}\PlantrackMCP\Plantrack.cmd"; Description: "Plantrack'i şimdi aç"; Flags: postinstall nowait skipifsilent shellexec

[Code]
function NodeVar(): Boolean;
var
  Kod: Integer;
begin
  Result := Exec(ExpandConstant('{cmd}'), '/c node -v', '', SW_HIDE, ewWaitUntilTerminated, Kod) and (Kod = 0);
end;

function InitializeSetup(): Boolean;
var
  Hata: Integer;
begin
  Result := True;
  if not NodeVar() then
  begin
    if MsgBox('Plantrack için Node.js (18 veya üstü) gerekli ve bu bilgisayarda bulunamadı.' + #13#10#13#10 +
              'İndirme sayfası açılsın mı? Node.js kurulduktan sonra bu kurulumu yeniden çalıştırın.' + #13#10 +
              '(Alternatif: PowerShell''de  winget install OpenJS.NodeJS.LTS)',
              mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://nodejs.org/', '', '', SW_SHOWNORMAL, ewNoWait, Hata);
    Result := False;
  end;
end;
