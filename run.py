#!/usr/bin/env python3
"""
英文學習系統啟動腳本
"""

import os
import sys
import subprocess


MIN_PYTHON = (3, 13)

def check_python_version():
    """檢查 Python 版本是否符合最低需求"""
    if sys.version_info < MIN_PYTHON:
        required = f"{MIN_PYTHON[0]}.{MIN_PYTHON[1]}"
        current = sys.version.split()[0]
        print(f"[ERROR] 目前 Python 版本為 {current}，本系統需要 Python {required} 以上版本。")
        print("請安裝或切換到較新的 Python 版本後再執行。")
        return False
    return True


def check_dependencies():
    """檢查依賴是否已安裝"""
    try:
        import flask
        import flask_cors
        import yt_dlp
        import deep_translator
        print("[OK] 所有依賴已安裝")
        return True
    except ImportError as e:
        print(f"[ERROR] 缺少依賴: {e}")
        print("請運行: pip install -r requirements.txt")
        return False

def start_app():
    """啟動Flask應用"""
    print(">>> 啟動英文學習系統...")
    print(">>> 應用將在 http://localhost:5000 上運行")
    print(">>> 按 Ctrl+C 停止應用")

    try:
        # 啟動Flask應用
        from app import app
        app.run(debug=True, host='0.0.0.0', port=5000)
    except KeyboardInterrupt:
        print("\n>>> 應用已停止")
    except Exception as e:
        print(f">>> 啟動失敗: {e}")
        return False

    return True

def main():
    """主函數"""
    print("=== 英文學習系統 ===")
    print("-" * 30)
    print(f"Python 版本 : {sys.version.split()[0]}")
    print(f"執行路徑   : {sys.executable}")

    # 檢查 Python 版本
    if not check_python_version():
        return 1

    # 檢查依賴
    if not check_dependencies():
        return 1

    # 啟動應用
    if start_app():
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())
