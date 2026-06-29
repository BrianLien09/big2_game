# CardDuel APK 一鍵更新與 Firebase 分發腳本
$ErrorActionPreference = "Stop"

# ==========================================
# ⚙️ Firebase App Distribution 設定
# ==========================================
# 已為您自動從 google-services.json 中載入對應的 Android 應用程式 ID
$ANDROID_APP_ID = "1:83144824900:android:a02a8e545edfdba13c0411"
$AUTO_UPLOAD = $true # 是否開啟自動上傳至 App Distribution

# ==========================================
# ⚙️ 環境變數設定
# ==========================================
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME="C:\Users\brian\AppData\Local\Android\Sdk"

# 載入 .env.local 中的環境變數並注入到當前 session (確保靜態打包時 Next.js 能讀取到金鑰)
if (Test-Path ".env.local") {
    Write-Host "正在從 .env.local 載入並注入環境變數..." -ForegroundColor Gray
    Get-Content ".env.local" | Where-Object { $_ -match '=' -and -not $_.StartsWith('#') } | ForEach-Object {
        $parts = $_ -split '=', 2
        $key = $parts[0].Trim()
        $val = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 開始更新 CardDuel APK..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. 自動遞增 versionCode (解決 Firebase App Distribution 版號重複的問題)
Write-Host "[Step 1/5] 正在自動增加 build 版號 (versionCode)..." -ForegroundColor Green
$buildGradlePath = "android\app\build.gradle"
$content = Get-Content $buildGradlePath -Raw
if ($content -match "versionCode\s+(\d+)") {
    [int]$oldCode = $Matches[1]
    [int]$newCode = $oldCode + 1
    $content = $content -replace "versionCode\s+\d+", "versionCode $newCode"
    Set-Content $buildGradlePath $content
    Write-Host "-> versionCode 已成功由 $oldCode 遞增至 $newCode" -ForegroundColor Yellow
}

# 2. 進行 Next.js 靜態建置與 Capacitor 同步
Write-Host "`n[Step 2/5] 正在進行 Next.js 靜態網頁建置與 Capacitor 資源同步..." -ForegroundColor Green
npm run build:cap

# 3. 進行 Android 原生編譯
Write-Host "`n[Step 3/5] 正在編譯 Android 原生專案 (Gradle)..." -ForegroundColor Green
Set-Location android
./gradlew.bat assembleDebug
Set-Location ..

# 4. 複製產出的 APK 到根目錄
Write-Host "`n[Step 4/5] 正在將編譯完的 APK 複製到根目錄..." -ForegroundColor Green
$apkPath = "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    Copy-Item $apkPath "CardDuel-debug.apk" -Force
    Write-Host "`n🎉 APK 編譯成功！已更新本機 CardDuel-debug.apk。" -ForegroundColor Cyan
} else {
    Write-Error "找不到編譯出的 APK 檔案，編譯可能失敗了。"
}

# 5. 上傳至 App Distribution
if ($AUTO_UPLOAD -and $ANDROID_APP_ID) {
    Write-Host "`n==========================================" -ForegroundColor Cyan
    Write-Host "📤 開始自動上傳至 Firebase App Distribution..." -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    
    # 檢查是否有安裝 firebase-tools CLI
    if (Get-Command firebase -ErrorAction SilentlyContinue) {
        # 取得當前時間做為發布說明的一部分
        $currentTime = Get-Date -Format "yyyy-MM-dd HH:mm"
        
        # 執行上傳指令 (使用您本機已登入的 Firebase 帳號)
        firebase appdistribution:distribute CardDuel-debug.apk --app $ANDROID_APP_ID --release-notes "自動建置版號: $newCode ($currentTime)"
        
        Write-Host "`n🎉 上傳成功！測試人員將會收到最新的測試版本通知。" -ForegroundColor Cyan
    } else {
        Write-Warning "未偵測到 Firebase CLI，已跳過自動上傳。請確認本機是否有安裝 Firebase CLI (可執行 npm install -g firebase-tools)，且已執行 'firebase login' 登入帳號。"
    }
}
