// 報修登記：送出表單並顯示最近 20 筆報修
(function () {
  "use strict";

  const TABLE = "repair_requests";
  const LIST_LIMIT = 20;
  const CATEGORIES = ["設備", "網路", "環境", "其他"];
  const URGENCIES = ["低", "中", "高"];
  const LIMITS = { reporter_name: 50, location: 100, description: 1000 };
  const LABELS = { reporter_name: "報修人", location: "地點或部門", category: "類別", description: "問題說明", urgency: "緊急程度" };

  const form = document.getElementById("repair-form");
  const submitBtn = document.getElementById("submit-btn");
  const formMsg = document.getElementById("form-message");
  const list = document.getElementById("request-list");
  const listMsg = document.getElementById("list-message");
  const refreshBtn = document.getElementById("refresh-btn");

  function showFormMessage(text, type) {
    formMsg.textContent = text;
    formMsg.className = "message " + type;
    formMsg.hidden = false;
  }

  // ---------- PWA：離線使用與安裝到主畫面 ----------
  // 註冊 service worker（只在 https 或 localhost 有效）
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 註冊失敗時照常當一般網頁使用 */ });
    });
  }

  const installBar = document.getElementById("install-bar");
  const installBtn = document.getElementById("install-btn");
  const iosHint = document.getElementById("ios-hint");
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let deferredPrompt = null;

  // Android / 電腦版 Chrome、Edge：瀏覽器判斷可安裝時，顯示「安裝到主畫面」按鈕
  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredPrompt = event;
    installBar.hidden = false;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
    installBar.hidden = true;
  });
  window.addEventListener("appinstalled", function () {
    installBar.hidden = true;
  });

  // iPhone / iPad 的 Safari 沒有安裝按鈕，改顯示操作說明
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !isStandalone) {
    installBar.hidden = false;
    iosHint.hidden = false;
  }

  // 離線提示
  const offlineBanner = document.getElementById("offline-banner");
  function updateOnlineStatus() {
    offlineBanner.hidden = navigator.onLine;
  }
  window.addEventListener("offline", updateOnlineStatus);
  updateOnlineStatus();

  // 建立 Supabase 連線；設定或程式庫缺少時直接在畫面上說明
  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) {
    const why = !window.supabase ? "無法載入 Supabase 程式庫，請檢查網路後重新整理。" : "缺少 Supabase 設定（config.js）。";
    showFormMessage(why, "error");
    listMsg.textContent = why;
    submitBtn.disabled = true;
    refreshBtn.disabled = true;
    return;
  }
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 把資料庫錯誤轉成看得懂的中文訊息
  function friendlyError(error) {
    if (!error) return "發生未知錯誤。";
    const code = error.code || "";
    if (code === "23514") return "資料不符合規定（例如字數過長或選項不正確），請檢查後再送出。";
    if (code === "42501") return "沒有權限執行這個動作，請聯絡系統管理員。";
    if (code === "42P01" || code === "PGRST205") return "找不到報修資料表，請確認資料庫已建立。";
    if (/fetch|network/i.test(error.message || "")) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + (error.message || code);
  }

  // ---------- 表單 ----------
  function readForm() {
    const data = new FormData(form);
    return {
      reporter_name: String(data.get("reporter_name") || "").trim(),
      location: String(data.get("location") || "").trim(),
      category: String(data.get("category") || ""),
      description: String(data.get("description") || "").trim(),
      urgency: String(data.get("urgency") || ""),
    };
  }

  function validate(rec) {
    const problems = [];
    for (const key of ["reporter_name", "location", "description"]) {
      const el = document.getElementById(key);
      let bad = false;
      if (!rec[key]) { problems.push("請填寫「" + LABELS[key] + "」"); bad = true; }
      else if (rec[key].length > LIMITS[key]) { problems.push("「" + LABELS[key] + "」最多 " + LIMITS[key] + " 字"); bad = true; }
      el.setAttribute("aria-invalid", bad ? "true" : "false");
    }
    const catEl = document.getElementById("category");
    const catBad = !CATEGORIES.includes(rec.category);
    if (catBad) problems.push("請選擇「類別」");
    catEl.setAttribute("aria-invalid", catBad ? "true" : "false");
    if (!URGENCIES.includes(rec.urgency)) problems.push("請選擇「緊急程度」");
    return problems;
  }

  // 使用者修改欄位時，清掉該欄位的紅框與舊的錯誤訊息
  function clearFieldError(event) {
    if (event.target.hasAttribute("aria-invalid")) event.target.removeAttribute("aria-invalid");
    if (formMsg.classList.contains("error")) formMsg.hidden = true;
  }
  form.addEventListener("input", clearFieldError);
  form.addEventListener("change", clearFieldError);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    formMsg.hidden = true;

    if (!navigator.onLine) {
      showFormMessage("目前離線，無法送出。填好的內容會保留在畫面上，連線後再按一次「送出報修」。", "error");
      return;
    }

    const rec = readForm();
    const problems = validate(rec);
    if (problems.length) {
      showFormMessage(problems.join("；") + "。", "error");
      const firstBad = form.querySelector('[aria-invalid="true"]');
      if (firstBad) firstBad.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    try {
      // 只送表單欄位；id、created_at、status 由資料庫自動產生
      const { error } = await client.from(TABLE).insert(rec);
      if (error) {
        showFormMessage("送出失敗：" + friendlyError(error), "error");
        return;
      }
      showFormMessage("已送出報修，謝謝！", "ok");
      form.reset();
      form.querySelectorAll("[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
      loadList();
    } catch (err) {
      showFormMessage("送出失敗：" + friendlyError(err), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "送出報修";
    }
  });

  // ---------- 清單 ----------
  const timeFormat = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // 一律用 textContent，避免把使用者輸入當成 HTML
    return node;
  }

  function renderItem(row) {
    const li = el("li", "request-item");
    const top = el("div", "item-top");
    top.append(
      el("span", "badge", row.category),
      el("span", "badge urgency-" + row.urgency, "緊急：" + row.urgency),
      el("span", "badge status", row.status)
    );
    const time = row.created_at ? timeFormat.format(new Date(row.created_at)) : "";
    li.append(
      top,
      el("p", "item-desc", row.description),
      el("p", "item-meta", row.reporter_name + "・" + row.location + (time ? "・" + time : ""))
    );
    return li;
  }

  // 上次成功載入的清單存在這台裝置上，離線時拿來顯示
  const LIST_CACHE_KEY = "repair-list-cache-v1";

  function saveListCache(rows) {
    try {
      localStorage.setItem(LIST_CACHE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), rows: rows }));
    } catch (e) { /* 無痕模式等情況可能無法儲存，忽略即可 */ }
  }

  function readListCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(LIST_CACHE_KEY) || "null");
      return saved && Array.isArray(saved.rows) ? saved : null;
    } catch (e) {
      return null;
    }
  }

  // 載入失敗時：有上次的資料就顯示上次的，並說明是舊資料
  function showCachedList(reason) {
    const saved = readListCache();
    if (!saved) {
      list.replaceChildren();
      listMsg.textContent = reason;
      return;
    }
    list.replaceChildren(...saved.rows.map(renderItem));
    listMsg.textContent = reason + "以下是 " + timeFormat.format(new Date(saved.savedAt)) + " 載入的資料。";
  }

  async function loadList() {
    listMsg.hidden = false;
    listMsg.textContent = "載入中…";
    refreshBtn.disabled = true;
    try {
      if (!navigator.onLine) {
        showCachedList("目前離線，無法載入最新清單。");
        return;
      }
      // 網路很差時不要一直卡在「載入中」：15 秒沒回應就放棄
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 15000);
      let data, error;
      try {
        ({ data, error } = await client
          .from(TABLE)
          .select("id, created_at, reporter_name, location, category, description, urgency, status")
          .order("created_at", { ascending: false })
          .limit(LIST_LIMIT)
          .abortSignal(controller.signal));
      } finally {
        clearTimeout(timer);
      }
      if (controller.signal.aborted) {
        showCachedList("網路回應太慢，無法載入最新清單。");
        return;
      }
      if (error) {
        showCachedList("無法載入清單：" + friendlyError(error));
        return;
      }
      saveListCache(data);
      list.replaceChildren(...data.map(renderItem));
      if (data.length) {
        listMsg.hidden = true;
      } else {
        listMsg.textContent = "目前還沒有報修資料。";
      }
    } catch (err) {
      showCachedList("無法載入清單：" + friendlyError(err));
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", loadList);
  // 恢復連線時，自動重新載入清單
  window.addEventListener("online", function () {
    updateOnlineStatus();
    loadList();
  });
  loadList();
})();
