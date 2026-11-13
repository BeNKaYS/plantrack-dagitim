@echo off
chcp 65001 >nul
rem Plantrack kurulumu (Windows) — cift tiklayin.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi.
  echo Kurmak icin PowerShell'de:  winget install OpenJS.NodeJS.LTS
  echo ya da https://nodejs.org adresinden LTS surumunu indirin.
  echo Kurulumdan sonra bu dosyayi yeniden calistirin.
  pause
  exit /b 1
)

node kurulum\kur.js %*
set KOD=%errorlevel%
echo.
pause
exit /b %KOD%
