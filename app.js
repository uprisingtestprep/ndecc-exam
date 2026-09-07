const ACCESS_CODE = "NDECC9000";

const DAY_SECONDS = 8 * 60 * 60; // 8 hour Day 1 exam
const SJ_STATION_SECONDS = 22 * 60; // disclosed practice assumption, 22 minutes
const IC_AND_S_MAX = 3;

const PROCEDURE_LABELS = {
  class_ii_amalgam_prep: "Class II Amalgam Preparation",
  class_ii_amalgam_restoration: "Class II Amalgam Restoration",
  class_ii_composite_restoration: "Class II Composite Resin Restoration",
  class_iv_composite_restoration: "Class IV Composite Resin Restoration",
  endo_access_prep: "Endodontic Access Cavity Preparation",
  crown_prep: "Crown Preparation",
  provisional_crown: "Provisional Crown Restoration",
};

// Real NDECC procedure order
const PROCEDURE_ORDER = [
  "class_ii_amalgam_prep",
  "class_ii_amalgam_restoration",
  "class_ii_composite_restoration",
  "class_iv_composite_restoration",
  "endo_access_prep",
  "crown_prep",
  "provisional_crown",
];

const SJ_DOMAIN_LABELS = {
  patient_centered_care: "Patient-Centered Care",
  professionalism: "Professionalism",
  communication_collaboration: "Communication and Collaboration",
  practice_info_management: "Practice and Information Management",
  health_promotion: "Health Promotion",
};

let CASES = [];
let STATIONS = [];

function $(id) { return document.getElementById(id); }

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function showScreen(id) {
  ["gate-screen", "menu-screen", "clinical-screen", "case-screen", "sj-screen"].forEach(s => {
    $(s).style.display = s === id ? "" : "none";
  });
}

// ---------- Access gate ----------
function checkAccessCode() {
  const val = $("access-code-input").value.trim().toUpperCase();
  if (val === ACCESS_CODE) {
    localStorage.setItem("ndecc_access", "1");
    loadDataAndShowMenu();
  } else {
    $("gate-error").textContent = "Incorrect access code. Please check your book or listing for the code.";
  }
}

$("gate-submit").addEventListener("click", checkAccessCode);
$("access-code-input").addEventListener("keydown", e => {
  if (e.key === "Enter") checkAccessCode();
});

async function loadDataAndShowMenu() {
  try {
    if (CASES.length === 0) {
      const casesRes = await fetch("cases.json");
      CASES = await casesRes.json();
    }
    if (STATIONS.length === 0) {
      const stationsRes = await fetch("stations.json");
      STATIONS = await stationsRes.json();
      buildSjDomainFilter();
    }
    showScreen("menu-screen");
  } catch (e) {
    $("gate-error").textContent = "Could not load practice content. Please refresh and try again.";
  }
}

// ---------- Menu ----------
$("mode-clinical").querySelector("button").addEventListener("click", () => {
  renderProcedureList();
  showScreen("clinical-screen");
});
$("mode-sj").querySelector("button").addEventListener("click", () => {
  sjFilteredIndices = [];
  sjCurrentPos = -1;
  applySjFilter();
  showScreen("sj-screen");
});

$("clinical-back").addEventListener("click", () => {
  stopDayTimer();
  showScreen("menu-screen");
});
$("sj-back").addEventListener("click", () => {
  stopSjTimer();
  showScreen("menu-screen");
});
$("case-back").addEventListener("click", () => {
  showScreen("clinical-screen");
});

// ========================================================================
// CLINICAL SKILLS REHEARSAL MODE
// ========================================================================

function getCompletedProcedures() {
  try {
    return new Set(JSON.parse(localStorage.getItem("ndecc_completed_procedures") || "[]"));
  } catch (e) {
    return new Set();
  }
}

function toggleCompletedProcedure(key, done) {
  const set = getCompletedProcedures();
  if (done) set.add(key); else set.delete(key);
  localStorage.setItem("ndecc_completed_procedures", JSON.stringify([...set]));
}

function renderProcedureList() {
  const completed = getCompletedProcedures();
  const container = $("procedure-list");
  container.innerHTML = "";

  PROCEDURE_ORDER.forEach((key, idx) => {
    const label = PROCEDURE_LABELS[key] || key;
    const row = document.createElement("div");
    row.className = "procedure-row";
    row.innerHTML = `
      <input type="checkbox" id="proc-check-${key}" ${completed.has(key) ? "checked" : ""}>
      <label for="proc-check-${key}" class="procedure-label">${idx + 1}. ${escapeHtml(label)}</label>
      <button class="btn btn-ghost btn-small" data-key="${key}">View a Case</button>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener("change", () => {
      const key = cb.id.replace("proc-check-", "");
      toggleCompletedProcedure(key, cb.checked);
    });
  });

  container.querySelectorAll('button[data-key]').forEach(btn => {
    btn.addEventListener("click", () => openRandomCase(btn.dataset.key));
  });
}

let currentCase = null;

function openRandomCase(procedureKey) {
  const pool = CASES.filter(c => c.procedure_type === procedureKey);
  if (pool.length === 0) {
    alert("No practice cases found for this procedure yet.");
    return;
  }
  const c = pool[Math.floor(Math.random() * pool.length)];
  currentCase = c;
  renderCase(c, procedureKey);
  showScreen("case-screen");
  window.scrollTo(0, 0);
}

function renderCase(c, procedureKey) {
  $("case-title-header").textContent = PROCEDURE_LABELS[procedureKey] || procedureKey;
  $("case-tooth").textContent = c.tooth_fdi ? `Tooth ${c.tooth_fdi} (FDI notation)` : "";
  $("case-scenario").textContent = c.scenario_text || "";
  $("case-technique").textContent = c.technique_notes || "Not provided for this case.";

  const checklistContainer = $("case-checklist");
  checklistContainer.innerHTML = "";
  (c.grading_checklist || []).forEach(item => {
    const block = document.createElement("div");
    block.className = "grading-block";
    block.innerHTML = `
      <h3>${escapeHtml(item.criterion_category)}</h3>
      <div class="grading-row"><span class="grading-tag pass">Competent</span><p>${escapeHtml(item.competent)}</p></div>
      <div class="grading-row"><span class="grading-tag warn">Minimally Competent</span><p>${escapeHtml(item.minimally_competent)}</p></div>
      <div class="grading-row"><span class="grading-tag fail">Fail</span><p>${escapeHtml(item.fail)}</p></div>
    `;
    checklistContainer.appendChild(block);
  });

  const criticalContainer = $("case-critical");
  criticalContainer.innerHTML = "";
  (c.critical_errors || []).forEach(err => {
    const p = document.createElement("p");
    p.className = "critical-item";
    p.textContent = err;
    criticalContainer.appendChild(p);
  });
}

$("case-another").addEventListener("click", () => {
  if (!currentCase) return;
  openRandomCase(currentCase.procedure_type);
});

// ---------- Day 1 timer (8 hours) ----------
let dayTimerInterval = null;
let dayTimerRemaining = DAY_SECONDS;

function formatHMS(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function loadDayTimerState() {
  const saved = parseInt(localStorage.getItem("ndecc_day_timer_remaining") || "", 10);
  dayTimerRemaining = isNaN(saved) ? DAY_SECONDS : saved;
  $("day-timer-display").textContent = formatHMS(dayTimerRemaining);
}
loadDayTimerState();

function tickDayTimer() {
  dayTimerRemaining--;
  if (dayTimerRemaining <= 0) {
    dayTimerRemaining = 0;
    stopDayTimer();
    $("day-timer-display").className = "done";
  }
  $("day-timer-display").textContent = formatHMS(dayTimerRemaining);
  localStorage.setItem("ndecc_day_timer_remaining", String(dayTimerRemaining));
}

$("day-timer-start").addEventListener("click", () => {
  if (dayTimerInterval) return;
  dayTimerInterval = setInterval(tickDayTimer, 1000);
});
$("day-timer-pause").addEventListener("click", stopDayTimer);
$("day-timer-reset").addEventListener("click", () => {
  stopDayTimer();
  dayTimerRemaining = DAY_SECONDS;
  $("day-timer-display").className = "";
  $("day-timer-display").textContent = formatHMS(dayTimerRemaining);
  localStorage.setItem("ndecc_day_timer_remaining", String(dayTimerRemaining));
});

function stopDayTimer() {
  if (dayTimerInterval) {
    clearInterval(dayTimerInterval);
    dayTimerInterval = null;
  }
}

// ---------- IC&S error counter ----------
function loadIcAndSCount() {
  const saved = parseInt(localStorage.getItem("ndecc_icands_count") || "0", 10);
  return isNaN(saved) ? 0 : saved;
}

function renderIcAndSCount() {
  const count = loadIcAndSCount();
  $("icands-count-display").textContent = `${count} of ${IC_AND_S_MAX}`;
  if (count > IC_AND_S_MAX) {
    $("icands-fail-banner").style.display = "";
    $("icands-count-display").className = "fail-count";
  } else {
    $("icands-fail-banner").style.display = "none";
    $("icands-count-display").className = "";
  }
}
renderIcAndSCount();

$("icands-log").addEventListener("click", () => {
  const count = loadIcAndSCount() + 1;
  localStorage.setItem("ndecc_icands_count", String(count));
  renderIcAndSCount();
});
$("icands-reset").addEventListener("click", () => {
  localStorage.setItem("ndecc_icands_count", "0");
  renderIcAndSCount();
});

// ========================================================================
// SITUATIONAL JUDGEMENT STATIONS MODE
// ========================================================================

let sjFilteredIndices = [];
let sjCurrentPos = -1;
let sjTimerInterval = null;
let sjTimerRemaining = SJ_STATION_SECONDS;

function buildSjDomainFilter() {
  const sel = $("sj-domain-filter");
  const keys = [...new Set(STATIONS.map(s => s.domain))];
  keys.forEach(k => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = SJ_DOMAIN_LABELS[k] || k;
    sel.appendChild(opt);
  });
}

$("sj-domain-filter").addEventListener("change", () => {
  applySjFilter();
});

function applySjFilter() {
  const domainFilter = $("sj-domain-filter").value;
  sjFilteredIndices = STATIONS
    .map((s, idx) => idx)
    .filter(idx => !domainFilter || STATIONS[idx].domain === domainFilter);
  sjCurrentPos = sjFilteredIndices.length > 0 ? 0 : -1;
  renderSjStation();
  renderSjTally();
}

function getSjResults() {
  try {
    return JSON.parse(localStorage.getItem("ndecc_sj_results") || "{}");
  } catch (e) {
    return {};
  }
}

function setSjResult(id, result) {
  const results = getSjResults();
  results[id] = result;
  localStorage.setItem("ndecc_sj_results", JSON.stringify(results));
  renderSjTally();
}

function renderSjTally() {
  const results = getSjResults();
  const attempted = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r === "pass").length;

  const domainsWithPass = new Set();
  Object.keys(results).forEach(idStr => {
    if (results[idStr] !== "pass") return;
    const st = STATIONS.find(s => String(s.id) === idStr);
    if (st) domainsWithPass.add(st.domain);
  });

  $("sj-tally").textContent =
    `${attempted} attempted, ${passed} self-assessed pass. Real pass rule: at least 6 of 10 stations, ` +
    `and at least 1 of 2 per domain (${domainsWithPass.size} of 5 domains covered so far).`;
}

function renderSjStation() {
  if (sjCurrentPos < 0 || sjFilteredIndices.length === 0) {
    $("sj-scenario-text").textContent = "No stations match this filter.";
    $("sj-task-text").textContent = "";
    $("sj-domain-badge").textContent = "";
    $("sj-station-num").textContent = "";
    $("sj-position").textContent = "";
    $("sj-answer-section").style.display = "none";
    $("sj-reveal-panel").style.display = "none";
    return;
  }

  const s = STATIONS[sjFilteredIndices[sjCurrentPos]];
  $("sj-domain-badge").textContent = SJ_DOMAIN_LABELS[s.domain] || s.domain;
  $("sj-station-num").textContent = `Station ${s.id}`;
  $("sj-scenario-text").textContent = s.scenario_text || "";
  $("sj-task-text").textContent = s.task_instruction || "";
  $("sj-position").textContent = `${sjCurrentPos + 1} of ${sjFilteredIndices.length}`;

  $("sj-answer-section").style.display = "none";
  $("sj-reveal-panel").style.display = "";

  resetSjTimer();
}

$("sj-prev").addEventListener("click", () => {
  if (sjCurrentPos > 0) {
    sjCurrentPos--;
    renderSjStation();
  }
});
$("sj-next").addEventListener("click", () => {
  if (sjCurrentPos < sjFilteredIndices.length - 1) {
    sjCurrentPos++;
    renderSjStation();
  }
});

$("sj-reveal-btn").addEventListener("click", () => {
  revealSjStation();
});

function revealSjStation() {
  if (sjCurrentPos < 0) return;
  const s = STATIONS[sjFilteredIndices[sjCurrentPos]];

  const compList = $("sj-competent-list");
  compList.innerHTML = "";
  (s.competent_behaviors || []).forEach(b => {
    const li = document.createElement("li");
    li.textContent = b;
    compList.appendChild(li);
  });

  const minList = $("sj-minimal-list");
  minList.innerHTML = "";
  (s.minimally_competent_behaviors || []).forEach(b => {
    const li = document.createElement("li");
    li.textContent = `${b.behavior} (${b.points} points)`;
    minList.appendChild(li);
  });

  const critList = $("sj-critical-list");
  critList.innerHTML = "";
  (s.critical_errors || []).forEach(e => {
    const li = document.createElement("li");
    li.textContent = e;
    critList.appendChild(li);
  });

  $("sj-model-answer").textContent = s.model_answer || "";
  $("sj-answer-section").style.display = "";
  $("sj-reveal-panel").style.display = "none";
  stopSjTimer();
}

$("sj-mark-pass").addEventListener("click", () => {
  if (sjCurrentPos < 0) return;
  const s = STATIONS[sjFilteredIndices[sjCurrentPos]];
  setSjResult(s.id, "pass");
});
$("sj-mark-work").addEventListener("click", () => {
  if (sjCurrentPos < 0) return;
  const s = STATIONS[sjFilteredIndices[sjCurrentPos]];
  setSjResult(s.id, "work");
});

// ---------- SJ per-station timer ----------
function formatMS(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function resetSjTimer() {
  stopSjTimer();
  sjTimerRemaining = SJ_STATION_SECONDS;
  $("sj-timer-display").textContent = formatMS(sjTimerRemaining);
  $("sj-timer-display").className = "";
}

function stopSjTimer() {
  if (sjTimerInterval) {
    clearInterval(sjTimerInterval);
    sjTimerInterval = null;
  }
}

function tickSjTimer() {
  sjTimerRemaining--;
  if (sjTimerRemaining <= 0) {
    sjTimerRemaining = 0;
    stopSjTimer();
    $("sj-timer-display").className = "done";
    revealSjStation();
  } else if (sjTimerRemaining <= 60) {
    $("sj-timer-display").className = "warning";
  }
  $("sj-timer-display").textContent = formatMS(sjTimerRemaining);
}

$("sj-timer-start").addEventListener("click", () => {
  if (sjTimerInterval) return;
  sjTimerInterval = setInterval(tickSjTimer, 1000);
});
$("sj-timer-reset").addEventListener("click", resetSjTimer);

// ---------- Init ----------
if (localStorage.getItem("ndecc_access") === "1") {
  loadDataAndShowMenu();
}
