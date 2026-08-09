@echo off
setlocal
cd /d "%~dp0"

echo === MSD Local Camera Server - Windows setup ===

where py >nul 2>&1 && (set "PYLAUNCH=py -3") || (set "PYLAUNCH=python")

if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment .venv ...
  %PYLAUNCH% -m venv .venv || goto :fail
)

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

echo Using Python: %VENV_PY%
"%VENV_PY%" -m pip install --upgrade pip
"%VENV_PY%" -m pip install -r requirements.txt || goto :fail

echo.
where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo [WARNING] ffmpeg was not found on PATH.
  echo           Install it with:  winget install Gyan.FFmpeg
  echo           then open a NEW terminal, or set FFMPEG_EXE to ffmpeg.exe
) else (
  echo ffmpeg found:
  where ffmpeg
)

where ffprobe >nul 2>&1
if errorlevel 1 echo [WARNING] ffprobe was not found on PATH ^(comes with FFmpeg^).

if not exist "mediamtx.exe" (
  if "%MEDIAMTX_EXE%"=="" echo [WARNING] mediamtx.exe not found next to this script. Download it from https://github.com/bluenviron/mediamtx/releases
)

echo.
echo Setup complete. Start the server with:  start_server.bat
exit /b 0

:fail
echo.
echo Setup FAILED. See the messages above.
exit /b 1
