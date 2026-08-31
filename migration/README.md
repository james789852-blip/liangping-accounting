# Supabase → Firebase 安全遷移手冊

這份手冊的原則是：**正式系統在所有核對完成前，仍只讀寫 Supabase。** Firebase 先作為獨立 staging 副本，不能直接取代正式資料庫。

## 目標架構

- Firebase Authentication：取代 Supabase Auth，保留每位使用者目前的 UUID 作為 Firebase UID。
- Cloud SQL for PostgreSQL：承接關聯式帳務資料；若要再使用 Firebase Data Connect，必須先用 staging POC 驗證現有 schema、trigger 與查詢是否相容。帳務資料不可直接改成 Firestore 文件結構，否則跨店、跨月、Excel 匯出與央廚對帳都需要重寫。
- Cloud Storage for Firebase：承接收據、信封、央廚、會議與歷史影片檔案。
- Next.js 資料存取層：逐步把目前散落的 Supabase 呼叫收斂，透過遷移模式決定資料來源。

## 現況盤點

- 37 個目前可由 Supabase REST 存取的 public 資料表。
- 4 個 Storage buckets：`receipts`、`excel-templates`、`meeting-reports`、`menu-videos`。
- 登入資料分成 `auth.users` 與 `public.user_profiles`，兩者 ID 必須一對一保留。
- PostgreSQL 內含外鍵、檢查限制、trigger、RLS 與 JSON/array 欄位，不能只用 CSV 搬移。
- 完整資源清單在 `expected-resources.json`。開始每一次試搬前都要重新產生即時清單，若有新增資料表或 bucket 必須先更新清單。

## 四種遷移模式

模式由 server-only 的 `lib/backend/migration-config.ts` 防護。尚未接上 Firebase adapter 前，改環境變數不會自行開始同步。

1. `supabase-only`：預設；正式讀寫全部留在 Supabase。
2. `shadow-read`：畫面仍使用 Supabase，伺服器背景讀 Firebase 並只記錄差異。
3. `dual-write`：Supabase 先成功，再透過可重試 outbox 寫 Firebase；Firebase 失敗不得讓 Supabase 成功資料消失。
4. `firebase-primary`：核對與回復演練完成後才可切換；Supabase保留唯讀回復期。

`dual-write`、正式環境測試與最終切換各有不同的確認字串，防止在 Vercel 誤設一個變數就切換正式資料。

## 分階段執行

### 0. 本次已完成的安全底座

- 盤點程式實際使用的 public 資料表與 Storage buckets。
- 加入遷移模式與正式環境防呆設定。
- 加入 PostgreSQL 全表 checksum、金額、狀態與央廚對帳核對 SQL。
- 現有 production 不引用 Firebase SDK，也不改 Supabase 設定。

### 1. 建立獨立 staging

1. 建立新的 Firebase 專案，名稱建議 `liangping-accounting-staging`。
2. 不綁正式網域，不改 Vercel production 環境變數。
3. 啟用 Firebase Auth、Cloud Storage，以及同區域的 Cloud SQL PostgreSQL／Data Connect。
4. 將 `firebase-staging.env.example` 複製成未納入 Git 的本機環境設定並填入 staging Project ID。
5. 設定預算上限與費用告警。Cloud SQL 建立前必須由帳號持有人確認方案與區域。

### 2. 唯讀試搬

1. 先做 Supabase PostgreSQL 可還原備份及 Storage object manifest。
2. 將 schema 還原到 staging，逐一處理 `auth.users` 外鍵、RLS 與 trigger 相容性。
3. 保留所有 UUID、日期時區、decimal 精度、JSON 與照片路徑。
4. 匯入 Auth 使用者；若密碼 hash 無法相容，採安全的重設密碼流程，不可保留明碼。
5. 複製 Storage，每個物件記錄來源路徑、目標路徑、大小、content-type 與 checksum。
6. 在來源及目標各執行 `sql/postgres-verify.sql`，結果必須完全相同。

### 3. Shadow read

- production 仍以 Supabase 回應畫面。
- Firebase 的比對只能在 server 執行，不可把管理金鑰放進 `NEXT_PUBLIC_*`。
- 比對至少包含：登入身分、店家權限、每日結帳、收入、支出、現金、匯款調整、預留款、照片、央廚叫貨與 Excel 月報。
- 所有差異寫入不含敏感內容的 migration audit；連續 7 天零差異才可進下一階段。

### 4. 可靠雙寫

- 不在一次網頁請求中直接「同時 await 兩個資料庫」；這會在其中一邊失敗時產生半套資料。
- Supabase transaction 內先寫正式資料與 outbox event，再由 worker 以 event ID 冪等寫入 Firebase。
- Firebase 完成後記錄來源版本、目標版本、checksum 與完成時間。
- 任何失敗必須重試、告警且可人工補送；不可以覆蓋較新的資料。
- 照片先成功上傳並驗證 checksum，再更新資料庫 URL。

### 5. 小範圍切換與正式切換

1. 先選一間非央廚店作 pilot，至少完整跑過每日結帳、退回、重送、Excel 匯出。
2. 再測央廚與總公司帳務核對。
3. 切換前停止短時間寫入、跑最後增量同步及完整核對。
4. 人工確認後才設定 `firebase-primary` 的三道確認值。
5. Supabase 至少保留 30 天唯讀，不刪資料、不刪 Storage。

## 必須通過的驗收門檻

- 資料表集合、欄位型別、外鍵與必要 trigger 相同。
- 每表 row count 與完整內容 checksum 相同。
- 每日／每店的營業額、支出、應包、實包、誤差完全相同。
- `submitted`、`verified`、`disputed` 不得變成 `draft`。
- 央廚店面輸入、央廚確認、差額、補款與照片完全相同。
- Auth 使用者數、UID、角色與分店權限完全相同。
- Storage 物件數、路徑、大小及 checksum 完全相同，抽樣可正常顯示。
- 月報與年度 Excel 的每店、每日、品項欄位結果一致。
- 回復演練可以在 30 分鐘內重新使用 Supabase，且不遺失切換期間的新資料。

只要任一門檻未通過，就維持或退回 `supabase-only`，不可用人工目測「看起來正常」取代核對結果。
