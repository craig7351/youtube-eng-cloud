# 🚀 部署指南

本指南將幫助您將英文學習系統部署到雲端平台，讓用戶可以透過網際網路訪問。

## 📋 支援的部署平台

### 推薦平台（支援 GitHub 自動部署）

1. **Render** ⭐ 最推薦
   - 免費方案可用
   - 支援 GitHub 自動部署
   - 配置簡單
   - 自動 HTTPS
   - ✅ **支援 Python 3.13**

2. **Railway**
   - 免費方案可用（每月 $5 額度）
   - 支援 GitHub 自動部署
   - 配置簡單
   - ✅ **支援 Python 3.13**

3. **Fly.io**
   - 免費方案可用
   - 支援 GitHub 自動部署
   - 全球 CDN
   - ⚠️ 需要確認 Python 3.13 支援

**重要**：本專案需要 Python 3.13，請確保選擇的平台支援此版本。

## 🎯 方法一：使用 Render（推薦）

### 步驟 1：準備 GitHub 倉庫

確保您的專案已經推送到 GitHub。

### 步驟 2：註冊 Render 帳號

1. 前往 [Render](https://render.com)
2. 使用 GitHub 帳號註冊/登入
3. 授權 Render 訪問您的 GitHub 倉庫

### 步驟 3：創建 Web Service

1. 在 Render Dashboard 點擊「New +」
2. 選擇「Web Service」
3. 連接您的 GitHub 倉庫
4. 配置如下：
   - **Name**: `youtube-eng`（或您喜歡的名稱）
   - **Region**: 選擇離您最近的區域（如 `Singapore`）
   - **Branch**: `main`（或您的主要分支）
   - **Root Directory**: 留空（使用根目錄）
   - **Runtime**: `Python 3`（會自動使用 `runtime.txt` 中指定的 3.13.0 版本）
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
   - **Plan**: `Free`（免費方案）

**注意**：本專案需要 Python 3.13，`runtime.txt` 已設定為 `python-3.13.0`，Render 會自動使用此版本。

### 步驟 4：環境變數（可選）

如果需要，可以在「Environment」標籤添加環境變數：
- `FLASK_ENV`: `production`（生產環境）

### 步驟 5：部署

1. 點擊「Create Web Service」
2. Render 會自動開始構建和部署
3. 等待部署完成（約 3-5 分鐘）
4. 部署完成後，您會獲得一個 URL，例如：`https://youtube-eng.onrender.com`

### 步驟 6：自動部署設定

- Render 預設會在您推送代碼到 GitHub 時自動重新部署
- 您可以在「Settings」中調整自動部署行為

## 🚂 方法二：使用 Railway

### 步驟 1：註冊 Railway 帳號

1. 前往 [Railway](https://railway.app)
2. 使用 GitHub 帳號註冊/登入

### 步驟 2：創建新專案

1. 點擊「New Project」
2. 選擇「Deploy from GitHub repo」
3. 選擇您的倉庫

### 步驟 3：配置部署

Railway 會自動偵測 Python 專案，但您可能需要設定：

1. 在專案設定中，點擊「Settings」
2. 在「Deploy」標籤中：
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`

### 步驟 4：部署

Railway 會自動開始部署，完成後會提供一個 URL。

## ✈️ 方法三：使用 Fly.io

### 步驟 1：安裝 Fly CLI

```bash
# macOS/Linux
curl -L https://fly.io/install.sh | sh

# Windows (使用 PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### 步驟 2：登入 Fly.io

```bash
fly auth login
```

### 步驟 3：初始化專案

```bash
fly launch
```

按照提示完成配置。

### 步驟 4：部署

```bash
fly deploy
```

## 📝 部署後檢查清單

- [ ] 應用可以正常訪問
- [ ] 首頁可以正常載入
- [ ] YouTube 影片可以正常載入
- [ ] 字幕功能正常
- [ ] 單字查詢功能正常
- [ ] 單字庫功能正常

## ⚠️ 注意事項

### 免費方案限制

1. **Render Free Plan**:
   - 應用在 15 分鐘無活動後會進入休眠
   - 首次喚醒可能需要 30-60 秒
   - 每月有使用時間限制

2. **Railway Free Plan**:
   - 每月 $5 免費額度
   - 超出後需要付費

3. **Fly.io Free Plan**:
   - 有資源限制
   - 需要信用卡驗證（但不會收費，除非超出免費額度）

### 生產環境建議

1. **使用付費方案**（如果需要 24/7 運行）:
   - Render: $7/月起
   - Railway: 按使用量計費
   - Fly.io: 按使用量計費

2. **資料持久化**:
   - 目前使用 JSON 文件存儲，在免費方案中資料會持久化
   - 如果需要更好的資料管理，建議使用資料庫（如 PostgreSQL）

3. **效能優化**:
   - 考慮使用 Redis 快取
   - 使用 CDN 加速靜態資源

## 🔧 故障排除

### 問題 1：部署失敗

**可能原因**：
- Python 版本不匹配
- 依賴安裝失敗
- 啟動命令錯誤
- 平台不支援 Python 3.13

**解決方法**：
1. 檢查 `requirements.txt` 是否正確
2. 確認 `runtime.txt` 中設定為 `python-3.13.0`
3. 查看部署日誌找出錯誤
4. **Python 3.13 支援**：
   - ✅ **Render**: 支援 Python 3.13
   - ✅ **Railway**: 支援 Python 3.13（自動偵測）
   - ⚠️ **Fly.io**: 需要確認是否支援，可能需要手動指定
   - ⚠️ **Heroku**: 可能尚未支援 Python 3.13，建議使用 Render 或 Railway

### 問題 2：應用無法啟動

**可能原因**：
- Port 設定錯誤
- 啟動命令錯誤

**解決方法**：
1. 確保使用 `$PORT` 環境變數
2. 檢查 `Procfile` 或啟動命令是否正確

### 問題 3：應用運行緩慢

**可能原因**：
- 免費方案資源限制
- 沒有使用 Gunicorn workers

**解決方法**：
1. 升級到付費方案
2. 調整 Gunicorn workers 數量（在 `Procfile` 中）

## 📚 相關資源

- [Render 文件](https://render.com/docs)
- [Railway 文件](https://docs.railway.app)
- [Fly.io 文件](https://fly.io/docs)
- [Gunicorn 文件](https://gunicorn.org)

## 💡 提示

1. **使用自訂域名**：
   - 所有平台都支援自訂域名
   - 在平台設定中添加您的域名即可

2. **監控和日誌**：
   - 所有平台都提供日誌查看功能
   - 建議定期檢查日誌以確保應用正常運行

3. **備份資料**：
   - 定期備份 JSON 資料文件
   - 考慮使用 Git 追蹤重要資料（如果資料量不大）

---

**祝您部署順利！** 🎉


