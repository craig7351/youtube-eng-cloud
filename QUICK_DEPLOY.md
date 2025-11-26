# ⚡ 快速部署指南

## 🎯 最簡單的部署方式：Render（5 分鐘完成）

### 步驟 1：推送到 GitHub
```bash
git add .
git commit -m "準備部署"
git push origin main
```

### 步驟 2：在 Render 部署

1. 前往 https://render.com
2. 註冊/登入（使用 GitHub 帳號）
3. 點擊「New +」→「Web Service」
4. 連接您的 GitHub 倉庫 `youtube-eng`
5. 設定：
   - **Name**: `youtube-eng`
   - **Region**: `Singapore`（或離您最近的區域）
   - **Branch**: `main`
   - **Root Directory**: （留空）
   - **Runtime**: `Python 3`（會自動使用 Python 3.13.0）
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
   - **Plan**: `Free`

**注意**：本專案需要 Python 3.13，`runtime.txt` 已設定正確版本。
6. 點擊「Create Web Service」

### 步驟 3：等待部署

- 首次部署約需 3-5 分鐘
- 部署完成後會獲得 URL，例如：`https://youtube-eng.onrender.com`
- 之後每次推送到 GitHub 都會自動重新部署

### ✅ 完成！

現在您的應用已經上線，可以分享給其他人使用了！

---

## 🔄 自動部署

部署完成後，每次您推送代碼到 GitHub 的 `main` 分支，Render 會自動：
1. 偵測到變更
2. 重新構建應用
3. 自動部署新版本

---

## 📝 注意事項

### Render 免費方案限制

- ⏰ **休眠機制**：應用在 15 分鐘無活動後會進入休眠
- 🚀 **喚醒時間**：首次喚醒可能需要 30-60 秒
- ⏱️ **使用時間**：每月有使用時間限制

### 如果需要 24/7 運行

考慮升級到 Render 的付費方案（$7/月起），應用將不會休眠。

---

## 🆘 遇到問題？

查看 [DEPLOYMENT.md](DEPLOYMENT.md) 的「故障排除」章節，或檢查 Render 的部署日誌。


