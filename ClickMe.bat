@echo off
rem Starts the local server and opens the page. Pass -NoOpen to skip opening.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" %*
