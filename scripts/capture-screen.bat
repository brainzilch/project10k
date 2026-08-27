@echo off
rem CLIMB screenshot hotkey launcher - see scripts/README.md for hotkey setup
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0capture-screen.ps1"
