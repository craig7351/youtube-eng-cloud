@echo off
chcp 65001 >nul
echo ====================================
echo ⛔ 關閉英文學習系統 Server
echo ====================================
echo.

REM 實際關閉邏輯放在子程序中，並完全靜音執行，避免顯示多餘錯誤訊息
call :KILL_SERVER >nul 2>&1

echo ✅ 已嘗試關閉所有相關伺服器進程。
pause
goto :EOF


:KILL_SERVER
REM 切換到此批次檔所在資料夾，方便比對路徑
cd /d %~dp0

REM 僅關閉在此專案底下執行 run.py 的 python 進程（避免關掉其它 Python）
wmic process where "name='python.exe' and commandline like '%%run.py%%'" call terminate >nul 2>&1

REM 嘗試關閉打包後的 english_learning.exe
taskkill /IM english_learning.exe /F >nul 2>&1
goto :EOF


