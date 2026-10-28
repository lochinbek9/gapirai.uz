@echo off
rem GapirAI skriptini DaVinci Resolve'ga o'rnatish (Windows): Workspace > Scripts > GapirAI
setlocal
set "DEST=%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
if not exist "%DEST%" mkdir "%DEST%"
copy /y "%~dp0GapirAI.lua" "%DEST%\GapirAI.lua" >nul
echo GapirAI o'rnatildi: %DEST%\GapirAI.lua
echo DaVinci Resolve'ni qayta ishga tushiring va Workspace ^> Scripts ^> GapirAI ni oching.
pause
