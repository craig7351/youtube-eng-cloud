@echo off
chcp 65001 >nul
echo ====================================
echo 🎓 英文學習系統
echo ====================================
echo.
cd /d %~dp0
python run.py
pause

