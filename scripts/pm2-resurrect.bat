@echo off
set PM2_HOME=%USERPROFILE%\.pm2
call "%APPDATA%\npm\pm2.cmd" resurrect
