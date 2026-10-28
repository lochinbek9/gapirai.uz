@echo off
rem GapirAI plaginini Premiere Pro'ga o'rnatish (Windows).
rem Imzolanmagan CEP panel uchun PlayerDebugMode yoqiladi va panel
rem %APPDATA%\Adobe\CEP\extensions ga nusxalanadi.
setlocal
set "SRC=%~dp0"
set "DEST=%APPDATA%\Adobe\CEP\extensions\uz.gapirai.premiere"

for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
for %%d in (CSXS jsx js css) do xcopy "%SRC%%%d" "%DEST%\%%d\" /e /i /q /y >nul
copy /y "%SRC%index.html" "%DEST%\" >nul
copy /y "%SRC%.debug" "%DEST%\" >nul

echo GapirAI o'rnatildi: %DEST%
echo Premiere Pro'ni qayta ishga tushiring va Window ^> Extensions ^> GapirAI ni oching.
pause
