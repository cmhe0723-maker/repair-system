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

  async function loadList() {
    listMsg.hidden = false;
    listMsg.textContent = "載入中…";
    refreshBtn.disabled = true;
    try {
      const { data, error } = await client
        .from(TABLE)
        .select("id, created_at, reporter_name, location, category, description, urgency, status")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) {
        listMsg.textContent = "無法載入清單：" + friendlyError(error);
        return;
      }
      list.replaceChildren(...data.map(renderItem));
      if (data.length) {
        listMsg.hidden = true;
      } else {
        listMsg.textContent = "目前還沒有報修資料。";
      }
    } catch (err) {
      listMsg.textContent = "無法載入清單：" + friendlyError(err);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", loadList);
  loadList();
})();
