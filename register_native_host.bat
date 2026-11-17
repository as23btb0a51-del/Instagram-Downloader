@echo off
title Register Native Host for Instagram Downloader
echo Registering Native Host in Windows Registry...

reg add "HKCU\Software\Mozilla\NativeMessagingHosts\com.instagram.downloader" /ve /d "%~dp0com.instagram.downloader.json" /f

if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Native Host registered! 
    echo Custom folder browsing and saving to any directory is now active.
) else (
    echo [ERROR] Failed to set registry key.
)
pause
