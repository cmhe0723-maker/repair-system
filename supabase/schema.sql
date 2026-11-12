-- =====================================================================
-- 報修登記系統：Supabase 建表 SQL
-- 用途：建立 repair_requests 資料表，並設定三層安全規則
--       （GRANT 權限、RLS 資料列安全、CHECK 欄位限制）。
-- 使用方式：在 Supabase 的 SQL Editor 貼上後執行。
--          整段包在交易裡，任何一步失敗都會全部取消。
-- 注意：這是示範用設計，資料一律使用虛構姓名與地點。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 一、建立資料表，並用 CHECK 限制欄位值與文字長度（第三層：CHECK）
-- ---------------------------------------------------------------------
-- id         ：主鍵，由資料庫自動產生 uuid。
-- created_at ：建立時間，由資料庫自動填入目前時間。
-- 文字欄位   ：去掉前後空白後不能是空字串，並限制最大字數，
--              避免空白資料或超長內容灌入。
-- category、urgency、status：只能是需求筆記列出的值。
create table if not exists public.repair_requests (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  reporter_name text        not null,
  location      text        not null,
  category      text        not null,
  description   text        not null,
  urgency       text        not null default '中',
  status        text        not null default '待處理',

  -- 報修人姓名：1 到 50 個字
  constraint repair_requests_reporter_name_len
    check (char_length(btrim(reporter_name)) between 1 and 50),

  -- 地點或部門：1 到 100 個字
  constraint repair_requests_location_len
    check (char_length(btrim(location)) between 1 and 100),

  -- 問題說明：1 到 1000 個字
  constraint repair_requests_description_len
    check (char_length(btrim(description)) between 1 and 1000),

  -- 類別：只能是 設備／網路／環境／其他
  constraint repair_requests_category_values
    check (category in ('設備', '網路', '環境', '其他')),

  -- 緊急程度：只能是 低／中／高（預設 中）
  constraint repair_requests_urgency_values
    check (urgency in ('低', '中', '高')),

  -- 處理狀態：只能是 待處理／處理中／已完成（預設 待處理）
  constraint repair_requests_status_values
    check (status in ('待處理', '處理中', '已完成'))
);

comment on table public.repair_requests is '報修登記（示範資料，全為虛構）';
comment on column public.repair_requests.id is '報修編號（系統自動產生）';
comment on column public.repair_requests.created_at is '登記時間（系統自動產生）';
comment on column public.repair_requests.reporter_name is '報修人姓名';
comment on column public.repair_requests.location is '地點或部門';
comment on column public.repair_requests.category is '類別：設備、網路、環境、其他';
comment on column public.repair_requests.description is '問題說明';
comment on column public.repair_requests.urgency is '緊急程度：低、中、高';
comment on column public.repair_requests.status is '處理狀態：待處理、處理中、已完成';

-- 清單依登記時間由新到舊排序時使用的索引
create index if not exists repair_requests_created_at_idx
  on public.repair_requests (created_at desc);

-- ---------------------------------------------------------------------
-- 二、GRANT：資料表層級的權限（第一層：GRANT）
-- ---------------------------------------------------------------------
-- 這個專案不會自動開放新資料表，所以要明確授權。
-- 先把所有角色的權限收回，確保從「什麼都不能做」開始。
revoke all on table public.repair_requests from public, anon, authenticated;

-- anon（網頁前端用公開金鑰連線時的角色）需要能使用 public schema。
grant usage on schema public to anon;

-- anon 可以讀取清單。
grant select on table public.repair_requests to anon;

-- anon 只能在「表單需要填的欄位」新增資料。
-- 沒有列出的 id、created_at、status 不能由前端指定，
-- 一律使用資料庫的預設值（新的 uuid、目前時間、待處理）。
grant insert (reporter_name, location, category, description, urgency)
  on table public.repair_requests to anon;

-- 不授予 update、delete、truncate：anon 不能修改或刪除任何資料。
-- 本次示範不做登入，所以 authenticated（登入者）也不給任何權限；
-- 之後若要讓管理員更新狀態，需要另外設計授權與政策。

-- ---------------------------------------------------------------------
-- 三、RLS：資料列安全（第二層：RLS）
-- ---------------------------------------------------------------------
-- 啟用後，沒有符合任何政策的操作都會被拒絕。
alter table public.repair_requests enable row level security;

-- 先刪除同名政策，讓這份檔案可以重複執行。
drop policy if exists "任何人可以讀取報修清單" on public.repair_requests;
drop policy if exists "任何人可以新增待處理的報修" on public.repair_requests;

-- 讀取：任何人（anon）都可以看到全部報修資料。
create policy "任何人可以讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

-- 新增：任何人（anon）都可以新增，但新資料的狀態只能是「待處理」。
-- （GRANT 已經不讓前端指定 status，這裡再多一層保護。）
create policy "任何人可以新增待處理的報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待處理');

-- 沒有建立 update、delete 的政策：即使將來誤給了權限，
-- RLS 仍會擋下修改與刪除。

commit;
