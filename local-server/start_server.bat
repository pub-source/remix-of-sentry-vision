@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo No .venv found - running setup first...
  call setup_windows.bat || exit /b 1
)

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

"%VENV_PY%" -c "import faster_whisper" >nul 2>&1
if errorlevel 1 (
  echo faster-whisper missing - installing requirements into %VENV_PY% ...
  "%VENV_PY%" -m pip install -r requirements.txt || exit /b 1
)

echo Starting MSD camera server with %VENV_PY%
"%VENV_PY%" camera_server.py
