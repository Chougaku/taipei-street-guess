# 台北街景猜猜 TaipeiGuessr

臺北市版的街景猜謎遊戲。看 Google 街景，在地圖上猜出你在臺北的哪裡，功能對標 GeoGuessr。支援 Web、Android App，以及 iOS（Safari / PWA）。

## 功能

| 模式 | 說明 |
|---|---|
| 經典模式 | 5 回合，每回合最高 5,000 分；可選可移動、不可移動、NMPZ，以及每回合時限 |
| 官方地圖 | 臺北市全區（12 區權重相同），以及 12 個行政區地圖（計分依地圖大小調整） |
| 挑戰連結 | 固定題目的分享連結，朋友玩完可以比較每一回合的猜測位置 |
| 每日挑戰 | 每天台北時間 00:00 換題，只有一次機會，有排行榜和連續天數 |
| 行政區／里連勝 | 猜對所在的行政區（或里）就繼續，猜錯結束 |
| 行政區探索 | 12 區各自收集銅、銀、金、白金獎牌 |
| Duels／Team Duels | 即時 1v1 或團隊對戰：各 6,000 血，第 5 回合起傷害倍率遞增，有人猜完後其他人剩 15 秒 |
| 大逃殺 | 距離模式（最遠的 25% 扣命）、行政區模式（1 次機會）、里模式（3 次機會） |
| 派對房間 | 用房間代碼或連結邀請朋友，房主設定模式、地圖和規則，可送表情 |
| 排位 | 依 ELO 配對的 Duels，段位分為青銅、白銀、黃金、大師、冠軍 |
| 帳號與社群 | 先以訪客遊玩，可升級成 Email 或 Google 帳號；有個人檔案、XP 和等級、26 個成就、好友和線上狀態、排行榜 |
| 地圖編輯器 | 點地圖自動吸附到官方街景、畫區域隨機生成、JSON 匯入／匯出，可公開、按讚、搜尋 |
| 問題回報 | 同一地點被 3 位玩家回報就自動下架，另有管理頁可處理回報 |

## 專案結構

```
apps/web/            React 19 + Vite + Tailwind v4 前端（PWA）＋ Capacitor Android（android/）
apps/server/         Fastify REST ＋ Socket.IO 即時對戰伺服器，正式環境同時提供前端靜態檔
packages/shared/     共用型別、計分公式、行政區／里邊界、對戰規則、ELO、XP、成就
supabase/migrations/ 資料庫 schema（伺服器啟動時會自動套用）
tools/geo-build/     從內政部資料（taiwan-atlas）產生臺北市 12 區、456 里的 GeoJSON
tools/location-gen/  用 Street View Metadata API（免費）產生出題地點池
```

資料流：
- 前端只用 Supabase 處理登入。
- 所有遊戲資料都經由遊戲伺服器存取。
- 伺服器在玩家猜完之前只給 pano ID，不給答案座標。
- 資料表都啟用 RLS 且沒有任何 policy，所以瀏覽器沒辦法直接讀取答案或竄改分數。

## 本機開發（不需要 Supabase）

```bash
npm install
npm run dev:server   # http://localhost:8787（內建 PGlite 資料庫，存放在 apps/server/.pglite）
npm run dev:web      # http://localhost:5173
```

沒有設定 `SUPABASE_URL` 時，伺服器會進入 dev 模式，每個瀏覽器自動成為訪客。
設定方式：複製 `.env.example` 為 `.env`，填入 Google Maps 金鑰。

## 測試

```bash
npm test             # 共用套件與伺服器的所有測試
npm run typecheck
```

伺服器測試用 in-memory PGlite 跑完整流程，涵蓋：
- 經典模式、挑戰、每日挑戰、連勝、好友
- 地圖編輯器、回報
- Socket.IO 對戰：Duels、排位、大逃殺

## 環境變數（`.env`，放在專案根目錄）

| 變數 | 用途 |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | 瀏覽器金鑰（Maps JavaScript API） |
| `VITE_GOOGLE_MAP_ID` | 猜測地圖用的 Map ID（開發時可用 `DEMO_MAP_ID`） |
| `GOOGLE_MAPS_SERVER_KEY` | 伺服器金鑰（Street View Static API metadata），不會出現在前端 |
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` | Supabase 專案 URL 和 anon／publishable key |
| `SUPABASE_URL` | 與上面相同的 URL，伺服器用來驗證 JWT |
| `SUPABASE_JWT_SECRET` | 只有舊專案使用 HS256 共用密鑰時才需要；新專案用 JWKS，不必設定 |
| `DATABASE_URL` | Postgres 連線字串（Supabase → Connect → Session pooler） |
| `CORS_ORIGINS` | 正式環境允許的來源，用逗號分隔 |

Android App 的建置設定放在 `.env.native`（範例見 `.env.native.example`）：
- `VITE_API_BASE_URL`：伺服器網址。模擬器連本機時用 `http://10.0.2.2:8787`。
- `VITE_PUBLIC_URL`：分享連結用的網址。

## Google Cloud 設定（上線前務必完成）

1. **瀏覽器金鑰**
   - Application restrictions 選 *Websites*，加入：
     - 正式網域 `https://your-domain/*`
     - `http://localhost:5173/*`
     - `https://localhost/*`（Capacitor Android）
   - API restrictions 只勾 **Maps JavaScript API**。
2. **伺服器金鑰**：API restrictions 只勾 **Street View Static API**，填入 `GOOGLE_MAPS_SERVER_KEY`。
3. **Map ID**：到 Map Management 建立 JavaScript 用的 Map ID（可以設定隱藏 POI 的樣式），填入 `VITE_GOOGLE_MAP_ID`。
4. **Budget alerts 和配額上限**：替 Dynamic Street View 和 Dynamic Maps 設定每日上限，避免帳單失控。

## Supabase 設定

1. 建立專案，把 URL、anon key 和 Session pooler 連線字串填進 `.env`。
2. 到 Authentication → Sign In / Providers，開啟 **Anonymous sign-ins** 和 **Email**。要 Google 登入的話，也在這裡啟用 Google provider，並填入 Google Cloud OAuth client。
   另外要開啟 **Allow manual linking**，訪客綁定 Google 帳號時才能保留原本的進度。
3. 到 Authentication → URL Configuration，把 Redirect URLs 加上：
   - `https://your-domain/auth/callback`
   - `http://localhost:5173/auth/callback`
   - `taipeiguessr://auth-callback`（Android）
4. 啟動伺服器，會自動建立資料表並匯入 7,687 個官方地點。

設定管理員：

```sql
update public.profiles set role = 'admin' where id = '<你的使用者 id>';
```

## 地點池

`apps/server/data/locations.json` 目前有 7,687 個地點：
- 全部是 `© Google` 官方街景，已排除使用者上傳的全景照片。
- 地點之間至少相距 80 m。
- 每區 385–1,169 個。

重新產生或補充：

```bash
npm run locations:gen -- --total 8000 --min-per-district 550
npm run locations:gen -- --district datong --min-per-district 450   # 只補某一區
npm run seed --workspace @tg/server                                 # 把新地點匯入資料庫
```

## 部署（Fly.io，單一服務）

```bash
fly launch --no-deploy --copy-config
fly secrets set SUPABASE_URL=... DATABASE_URL=... GOOGLE_MAPS_SERVER_KEY=... CORS_ORIGINS=https://your-domain
fly deploy --build-arg VITE_GOOGLE_MAPS_API_KEY=... --build-arg VITE_GOOGLE_MAP_ID=... \
           --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=...
```

伺服器會打包成單一檔案（`apps/server/dist/index.mjs`），Docker 映像不需要 node_modules。

> 即時對戰的狀態存在記憶體，所以目前只跑**一台**機器（`fly.toml` 已設定）。之後要擴充，可以加上 Socket.IO Redis adapter，並讓同一場對戰固定連到同一台機器（sticky session）。

## Android App

```bash
cd apps/web
npm run cap:sync        # vite build --mode native + cap sync android
npx cap open android    # 用 Android Studio 開啟、執行或簽章
```

命令列建置：
- `JAVA_HOME` 指向 Android Studio 內附的 JBR。
- Debug：`./gradlew assembleDebug`
- Release：`./gradlew bundleRelease`

Release 簽章：
- 產生 keystore：`keytool -genkeypair -v -keystore taipeiguessr-release.jks -alias taipeiguessr -keyalg RSA -keysize 2048 -validity 10000`
- 建立 `apps/web/android/keystore.properties`（已加進 `.gitignore`，欄位格式見 `app/build.gradle` 的註解）。
- keystore 請自己保管、備份，**遺失就無法更新 Google Play 上的 App**。

> ⚠️ 專案路徑含中文（`GeoGuesser台北版`），Android Gradle Plugin 在 Windows 上會出錯。`gradle.properties` 已加上 `android.overridePathCheck=true`；若仍有問題，可以用純英文路徑的 junction 建置：
> `New-Item -ItemType Junction -Path C:\Users\<你>\tg-build -Target "<專案路徑>"`，再到 `C:\Users\<你>\tg-build\apps\web\android` 執行 Gradle。
> 最根本的做法是把專案資料夾改成英文名稱。

Deep link：
- `taipeiguessr://c/<挑戰代碼>`、`taipeiguessr://party/<房間代碼>`
- OAuth 回呼：`taipeiguessr://auth-callback`

## iOS

目前不上架 App Store，iOS 使用者用 Safari 開啟網站，再從「分享 → 加入主畫面」以 PWA 全螢幕遊玩。

程式碼已經是 Capacitor 架構，之後有 Mac 時執行 `npx cap add ios` 就能產生 iOS App（Google 登入需要另外設定 URL scheme）。

## 已知限制

- 答案無法完全隱藏：遊戲一定要把 pano ID 給前端才能顯示街景，有心人能從 pano 查出位置（GeoGuessr 也有同樣限制）。伺服器負責計分和計時，前端無法竄改分數。
- 即時對戰目前只支援單一伺服器（見「部署」）。
- 付費會員、商店、廣告、Quiz、季賽活動和推播通知不在這次範圍內。
