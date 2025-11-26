@echo off
chcp 65001 >nul
echo ====================================
echo 🔧 建立英文學習系統 exe
echo ====================================
echo.

REM 切換到此批次檔所在資料夾
cd /d %~dp0

echo [1/3] 清除舊的 build/dist 檔案...
if exist build rd /s /q build
if exist dist rd /s /q dist
if exist english_learning.spec del /q english_learning.spec

echo [2/3] 使用目前的 python 打包 exe...
python -m PyInstaller --noconfirm --onefile --name english_learning ^
  --add-data "templates;templates" ^
  --add-data "static;static" ^
  run.py

if errorlevel 1 (
  echo.
  echo [ERROR] 打包失敗，請檢查上方錯誤訊息。
  pause
  exit /b 1
)

echo.
echo [3/3] 複製 JSON 資料檔到 dist 目錄...
if exist word_banks.json copy /Y word_banks.json dist\ >nul
if exist user_data.json copy /Y user_data.json dist\ >nul
if exist bookmarks.json copy /Y bookmarks.json dist\ >nul
if exist subtitle_cache.json copy /Y subtitle_cache.json dist\ >nul
if exist translation_cache.json copy /Y translation_cache.json dist\ >nul

echo.
echo ✅ 完成！請到 dist\english_learning.exe 執行程式。
pause


