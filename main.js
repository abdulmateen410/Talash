// ─── State ───────────────────────────────────────────────────────────────────
let allCandidates  = [];
let currentJobId   = null;
let currentFiles   = [];        // ALL files in queue (including processed)
let processedFiles = new Set(); // names of already-processed files
let pollInterval   = null;
let currentXlsx    = "";
let currentJson    = "";
let charts         = {};
let sidebarOpen    = true;

const TITLES = {
  dashboard:  ["Dashboard",    "CV Extraction & Analysis System"],
  upload:     ["Upload CVs",   "Process PDF and image files — extract structured data"],
  candidates: ["Candidates",   "Browse and inspect extracted profiles"],
  emails:     ["Draft Emails", "Auto-generated missing-info emails"],
};

const IMAGE_EXTS = new Set([".png",".jpg",".jpeg",".gif",".bmp",".webp",".tiff"]);

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener("load", async () => {
  await loadUser();
  checkExtractionMode();
});

async function loadUser() {
  try {
    const res  = await fetch("/api/me");
    const data = await res.json();
    if (data.username) {
      document.getElementById("user-badge").textContent = "👤 " + (data.display || data.username);
    } else {
      window.location.href = "/login";
    }
  } catch (e) {
    window.location.href = "/login";
  }
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login";
}

// ─── Sidebar toggle ───────────────────────────────────────────────────────────
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById("sidebar");
  const main    = document.getElementById("main");
  sidebar.classList.toggle("collapsed",  !sidebarOpen);
  main.classList.toggle("sidebar-collapsed", !sidebarOpen);
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n => {
    const label = n.querySelector(".nav-label")?.textContent?.toLowerCase() || "";
    if (label.includes(name === "candidates" ? "cand" : name.slice(0, 4)))
      n.classList.add("active");
  });
  const [t, s] = TITLES[name] || ["TALASH", ""];
  document.getElementById("topbar-title").textContent = t;
  document.getElementById("topbar-sub").textContent   = s;
  if (name === "candidates") renderCandidateTable(allCandidates);
  if (name === "emails")     renderEmails();
  if (name === "dashboard")  updateDashboard();
}

// ─── File handling ────────────────────────────────────────────────────────────
function isImage(filename) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function handleDrop(ev) {
  ev.preventDefault();
  document.getElementById("dropZone").classList.remove("drag-over");
  const files = [...ev.dataTransfer.files].filter(f => isAccepted(f.name));
  addFiles(files);
}

function handleFileSelect(fileList) { addFiles([...fileList]); }

function isAccepted(name) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return [".pdf",".png",".jpg",".jpeg",".gif",".bmp",".webp",".tiff"].includes(ext);
}

function addFiles(files) {
  files.forEach(f => {
    if (!currentFiles.find(x => x.name === f.name)) currentFiles.push(f);
  });
  renderQueue();
  updateProcessBtn();
  const newCount = currentFiles.filter(f => !processedFiles.has(f.name)).length;
  document.getElementById("logBox").textContent =
    `${currentFiles.length} file(s) in queue. ${newCount} new — click "Process New Files" to begin.`;
}

function updateProcessBtn() {
  const hasNew = currentFiles.some(f => !processedFiles.has(f.name));
  document.getElementById("processBtn").disabled = !hasNew;
}

function renderQueue() {
  const wrap = document.getElementById("queueList");
  document.getElementById("queue-count").textContent =
    currentFiles.length ? `(${currentFiles.length})` : "";

  if (!currentFiles.length) {
    wrap.innerHTML = `<div class="empty" style="padding:30px">
      <div class="icon" style="font-size:24px">📂</div><p>No files added</p></div>`;
    return;
  }
  wrap.innerHTML = currentFiles.map((f, i) => {
    const done = processedFiles.has(f.name);
    const icon = isImage(f.name) ? "🖼" : "📄";
    return `
    <div class="queue-item ${done ? 'processed' : ''}" id="qi-${i}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="fname">${icon} ${f.name}</div>
        <span style="font-size:10px;color:var(--muted)">${(f.size/1024/1024).toFixed(1)} MB</span>
      </div>
      <div class="finfo" id="qi-info-${i}">${done ? "✓ Already processed" : "Waiting"}</div>
      <div class="progress-bar">
        <div class="progress-fill" id="qi-prog-${i}"
             style="width:${done?'100':'0'}%;background:${done?'var(--green)':'var(--blue)'}"></div>
      </div>
    </div>`;
  }).join("");
}

function clearQueue() {
  currentFiles   = [];
  processedFiles = new Set();
  currentJobId   = null;
  if (pollInterval) clearInterval(pollInterval);
  renderQueue();
  updateProcessBtn();
  document.getElementById("downloadBox").style.display = "none";
  document.getElementById("logBox").textContent = "Queue cleared.";
}

// ─── Processing — only new files ──────────────────────────────────────────────
async function startProcessing() {
  const newFiles = currentFiles.filter(f => !processedFiles.has(f.name));
  if (!newFiles.length) return;

  const fd = new FormData();
  newFiles.forEach(f => fd.append("files", f));

  document.getElementById("processBtn").disabled = true;
  document.getElementById("logBox").textContent = `Uploading ${newFiles.length} new file(s)…`;
  document.getElementById("downloadBox").style.display = "none";

  try {
    const res  = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (data.error) { log("❌ " + data.error); updateProcessBtn(); return; }
    currentJobId = data.job_id;
    log(`Job started (ID: ${currentJobId}) — ${newFiles.length} file(s)`);
    pollInterval = setInterval(() => pollStatus(newFiles), 1500);
  } catch (e) {
    log("Upload error: " + e);
    updateProcessBtn();
  }
}

async function pollStatus(newFiles) {
  if (!currentJobId) return;
  try {
    const res  = await fetch("/api/status/" + currentJobId);
    const data = await res.json();

    if (data.log && data.log.length) {
      document.getElementById("logBox").textContent = data.log.join("\n");
      document.getElementById("logBox").scrollTop =
        document.getElementById("logBox").scrollHeight;
    }

    if (data.total > 0) {
      const pct = Math.round((data.progress / Math.max(data.total, 1)) * 100);
      // Only update progress bars for NEW files (by index in currentFiles)
      newFiles.forEach(f => {
        const i = currentFiles.findIndex(x => x.name === f.name);
        if (i < 0) return;
        const prog = document.getElementById(`qi-prog-${i}`);
        const info = document.getElementById(`qi-info-${i}`);
        if (prog) { prog.style.width = pct + "%"; prog.style.background = "var(--green)"; }
        if (info)   info.textContent = `${data.progress} / ${data.total} extracted`;
      });
    }

    if (data.status === "done") {
      clearInterval(pollInterval);
      currentXlsx = data.xlsx; currentJson = data.json;

      const cr = await fetch("/api/candidates/" + currentJobId);
      const newCandidates = await cr.json();
      // Merge: append new candidates to existing list (avoid duplicates by name+source)
      newCandidates.forEach(nc => {
        const key = `${nc._source}__${(nc.personal_info||{}).name}`;
        const exists = allCandidates.some(
          ec => `${ec._source}__${(ec.personal_info||{}).name}` === key
        );
        if (!exists) allCandidates.push(nc);
      });

      // Mark these files as processed
      newFiles.forEach(f => processedFiles.add(f.name));

      if (data.xlsx || data.json)
        document.getElementById("downloadBox").style.display = "block";

      // Update queue display
      newFiles.forEach(f => {
        const i = currentFiles.findIndex(x => x.name === f.name);
        if (i < 0) return;
        const qi   = document.getElementById(`qi-${i}`);
        const prog = document.getElementById(`qi-prog-${i}`);
        const info = document.getElementById(`qi-info-${i}`);
        if (qi)   qi.classList.add("processed");
        if (prog) { prog.style.width = "100%"; prog.style.background = "var(--green)"; }
        if (info)  info.textContent = "✓ Done";
      });

      updateDashboard();
      updateProcessBtn();
      log(`✓ Done — ${newCandidates.length} new candidate(s) extracted (total: ${allCandidates.length})`);
    } else if (data.status === "error") {
      clearInterval(pollInterval);
      log("❌ Error: " + data.error);
      updateProcessBtn();
    }
  } catch (e) { console.error(e); }
}

function log(msg) {
  const lb = document.getElementById("logBox");
  lb.textContent += "\n" + msg;
  lb.scrollTop = lb.scrollHeight;
}

function downloadFile(type) {
  const fname = type === "xlsx" ? currentXlsx : currentJson;
  if (!fname) return;
  window.location.href = "/api/download/" + fname;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function updateDashboard() {
  const n = allCandidates.length;
  document.getElementById("stat-total").textContent     = n || "—";
  document.getElementById("stat-total-sub").textContent = n ? `${n} processed` : "Upload CVs to begin";

  const withPub = allCandidates.filter(c => (c.publications||[]).length > 0).length;
  document.getElementById("stat-pubs").textContent     = withPub || "—";
  document.getElementById("stat-pubs-sub").textContent = withPub ? `of ${n} candidates` : "";

  const miss = allCandidates.filter(c => (c._missing||[]).length > 0).length;
  document.getElementById("stat-miss").textContent = miss || "—";

  const phd = allCandidates.filter(c => (c.education||[]).some(e => e.level === "PhD")).length;
  document.getElementById("stat-phd").textContent     = phd || "—";
  document.getElementById("stat-phd-sub").textContent = phd ? `of ${n} candidates` : "";

  buildCharts();
  buildDashTable(allCandidates);
}

function buildCharts() {
  if (!allCandidates.length) return;

  // Publication type breakdown
  const pubCtx = document.getElementById("chartPubs").getContext("2d");
  const journals = allCandidates.reduce((s,c) =>
    s + (c.publications||[]).filter(p => p.type==="Journal").length, 0);
  const confs = allCandidates.reduce((s,c) =>
    s + (c.publications||[]).filter(p => p.type==="Conference").length, 0);
  if (charts.pubs) charts.pubs.destroy();
  charts.pubs = new Chart(pubCtx, {
    type: "doughnut",
    data: {
      labels: ["Journals", "Conferences"],
      datasets: [{ data: [journals, confs],
        backgroundColor: ["rgba(59,130,246,.8)","rgba(167,139,250,.8)"],
        borderColor: "#22262c", borderWidth: 2 }]
    },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#e2e8f0", font: {size:11} } } } }
  });

  // Degree breakdown
  const degCtx = document.getElementById("chartDegree").getContext("2d");
  const counts = { SSC:0, HSSC:0, Bachelor:0, Master:0, PhD:0, PostDoc:0, Other:0 };
  allCandidates.forEach(c => {
    const levels = (c.education||[]).map(e => e.level);
    const priority = ["PostDoc","PhD","Master","Bachelor","HSSC","SSC","Other"];
    for (const p of priority) {
      if (levels.includes(p)) { counts[p]++; break; }
    }
  });
  const labels = Object.keys(counts).filter(k => counts[k] > 0);
  const colors = {
    PhD:"rgba(167,139,250,.8)", PostDoc:"rgba(232,93,61,.8)",
    Master:"rgba(59,130,246,.8)", Bachelor:"rgba(34,197,94,.8)",
    HSSC:"rgba(234,179,8,.8)", SSC:"rgba(239,68,68,.8)", Other:"rgba(107,114,128,.8)"
  };
  if (charts.deg) charts.deg.destroy();
  charts.deg = new Chart(degCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: labels.map(l => counts[l]),
        backgroundColor: labels.map(l => colors[l] || "rgba(107,114,128,.8)"),
        borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#6b7280", font:{size:10} }, grid: { color:"#2e333b" } },
        y: { ticks: { color: "#6b7280", font:{size:10} }, grid: { color:"#2e333b" } }
      }
    }
  });
}

let _tableData = [];
function buildDashTable(candidates) {
  _tableData = candidates;
  renderDashTableRows(candidates);
}

function renderDashTableRows(list) {
  const wrap = document.getElementById("dash-table-wrap");
  if (!list.length) {
    wrap.innerHTML = `<div class="empty"><div class="icon">📋</div>
      <h3>No candidates yet</h3><p>Upload a file to get started.</p></div>`;
    return;
  }
  wrap.innerHTML = `<table><thead><tr>
    <th>#</th><th>Name</th><th>Post</th><th>Qualification</th>
    <th>Pubs</th><th>Status</th></tr></thead><tbody>
    ${list.map((c, i) => {
      const pi   = c.personal_info || {};
      const edu  = c.education     || [];
      const pubs = c.publications  || [];
      const miss = c._missing      || [];
      const hi   = edu.reduce((best, e) => {
        const rank = ["PostDoc","PhD","Master","Bachelor","HSSC","SSC","Other"];
        return rank.indexOf(e.level) < rank.indexOf(best) ? e.level : best;
      }, "Other");
      const badge = miss.length
        ? `<span class="badge badge-yellow">⚠ Missing</span>`
        : `<span class="badge badge-green">✓ Complete</span>`;
      return `<tr style="cursor:pointer" onclick="showScreen('candidates');setTimeout(()=>openDetail(${allCandidates.indexOf(c)}),50)">
        <td style="color:var(--muted)">${i+1}</td>
        <td><strong>${pi.name||"—"}</strong></td>
        <td style="color:var(--muted);font-size:11px">${pi.post_applied||"—"}</td>
        <td><span class="badge badge-purple">${hi}</span></td>
        <td style="color:var(--blue)">${pubs.length}</td>
        <td>${badge}</td></tr>`;
    }).join("")}
  </tbody></table>`;
}

function filterTable(q) {
  const lo = q.toLowerCase();
  renderDashTableRows(_tableData.filter(c => {
    const pi = c.personal_info || {};
    return (pi.name||"").toLowerCase().includes(lo) ||
           (pi.post_applied||"").toLowerCase().includes(lo);
  }));
}

// ─── Candidates screen ────────────────────────────────────────────────────────
let _filteredCands = [];
function renderCandidateTable(candidates) {
  _filteredCands = candidates;
  const wrap  = document.getElementById("cand-table-wrap");
  const count = document.getElementById("cand-count");
  count.textContent = candidates.length ? `${candidates.length} candidate(s)` : "";

  if (!candidates.length) {
    wrap.innerHTML = `<div class="empty"><div class="icon">👤</div>
      <h3>No candidates loaded</h3><p>Upload and process CVs first.</p></div>`;
    return;
  }
  wrap.innerHTML = `<table><thead><tr>
    <th>#</th><th>Name</th><th>Post Applied</th><th>Degree</th>
    <th>Experience</th><th>Publications</th><th>Missing</th><th></th></tr></thead><tbody>
    ${candidates.map((c, i) => {
      const pi   = c.personal_info || {};
      const edu  = c.education     || [];
      const exp  = c.experience    || [];
      const pubs = c.publications  || [];
      const miss = c._missing      || [];
      const hi   = edu.reduce((best, e) => {
        const rank = ["PostDoc","PhD","Master","Bachelor","HSSC","SSC","Other"];
        return rank.indexOf(e.level) < rank.indexOf(best) ? e.level : best;
      }, "Other");
      return `<tr>
        <td style="color:var(--muted)">${i+1}</td>
        <td><strong>${pi.name||"—"}</strong><br>
            <span style="font-size:10px;color:var(--muted)">${c._source||""}</span></td>
        <td style="font-size:11px">${pi.post_applied||"—"}</td>
        <td><span class="badge badge-purple">${hi}</span></td>
        <td>${exp.length} role${exp.length!==1?"s":""}</td>
        <td style="color:var(--blue)">${pubs.length}</td>
        <td>${miss.length
          ? `<span class="badge badge-yellow">${miss.length}</span>`
          : `<span class="badge badge-green">✓</span>`}</td>
        <td><button class="btn btn-outline" style="padding:4px 10px;font-size:10px"
            onclick="openDetail(${allCandidates.indexOf(c)})">View</button></td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}

function filterCandidates(q) {
  const lo = q.toLowerCase();
  renderCandidateTable(allCandidates.filter(c => {
    const pi  = c.personal_info || {};
    const edu = c.education     || [];
    return (pi.name||"").toLowerCase().includes(lo) ||
           (pi.post_applied||"").toLowerCase().includes(lo) ||
           edu.some(e => (e.degree||"").toLowerCase().includes(lo));
  }));
}

function openDetail(idx) {
  const c = allCandidates[idx];
  if (!c) return;
  document.getElementById("cand-list-view").style.display   = "none";
  document.getElementById("cand-detail-view").style.display = "block";

  const pi       = c.personal_info || {};
  const edu      = c.education     || [];
  const exp      = c.experience    || [];
  const pubs     = c.publications  || [];
  const miss     = c._missing      || [];
  const analysis = c._analysis    || {};

  const infoRows = Object.entries(pi)
    .filter(([k,v]) => v)
    .map(([k,v]) => `<div class="detail-row">
      <span class="key">${k.replace(/_/g," ")}</span>
      <span class="val">${v}</span></div>`).join("");

  const eduRows = edu.map(e => `<tr>
    <td><span class="badge badge-purple">${e.level||"—"}</span></td>
    <td>${e.degree||"—"}</td>
    <td>${e.grade_cgpa_percentage||"—"}</td>
    <td>${e.passing_year||"—"}</td>
    <td style="font-size:11px">${e.institution||e.board_university||"—"}</td></tr>`
  ).join("") || `<tr><td colspan="5" style="color:var(--muted)">No education records</td></tr>`;

  const expRows = exp.map(e => `<tr>
    <td>${e.post||"—"}</td>
    <td>${e.organization||"—"}</td>
    <td style="color:var(--muted);font-size:11px">${e.start_date||""} → ${e.end_date||""}</td>
    <td style="color:var(--muted);font-size:11px">${e.location||""}</td></tr>`
  ).join("") || `<tr><td colspan="4" style="color:var(--muted)">No experience records</td></tr>`;

  const pubRows = pubs.map(p => `<tr>
    <td style="max-width:300px">${p.title||"—"}</td>
    <td><span class="badge ${p.type==="Journal"?"badge-blue":"badge-purple"}">${p.type||""}</span></td>
    <td>${p.impact_factor != null ? p.impact_factor : "—"}</td>
    <td>${p.year||"—"}</td>
    <td style="font-size:11px;color:var(--muted)">${p.published_in||""}</td></tr>`
  ).join("") || `<tr><td colspan="5" style="color:var(--muted)">No publications</td></tr>`;

  const eduA = analysis.education  || {};
  const expA = analysis.experience || {};
  const resA = analysis.research   || {};
  const q    = resA.quartile_distribution || {};

  const analysisEduHtml = `
    <div class="detail-row"><span class="key">SSC %</span><span class="val">${eduA.ssc_percent||"—"}</span></div>
    <div class="detail-row"><span class="key">HSSC %</span><span class="val">${eduA.hssc_percent||"—"}</span></div>
    <div class="detail-row"><span class="key">UG Institution</span><span class="val">${eduA.ug_details?.institution||"—"}</span></div>
    <div class="detail-row"><span class="key">UG Grade</span><span class="val">${eduA.ug_details?.grade||"—"}</span></div>
    <div class="detail-row"><span class="key">PG Institution</span><span class="val">${eduA.pg_details?.institution||"—"}</span></div>
    <div class="detail-row"><span class="key">PhD Institution</span><span class="val">${eduA.phd_details?.institution||"—"}</span></div>
    <div class="detail-row"><span class="key">Rankings (THE/QS)</span><span class="val">${JSON.stringify(eduA.institution_rankings||{})}</span></div>
    <div class="detail-row"><span class="key">Assessment</span><span class="val">${eduA.overall_assessment||"—"}</span></div>
    <div class="detail-row"><span class="key">Progression Gaps</span><span class="val">${(eduA.progression_gaps||[]).join("; ")||"None"}</span></div>`;

  const analysisExpHtml = `
    <div class="detail-row"><span class="key">Overlaps</span><span class="val">${(expA.overlaps||[]).join("; ")||"None"}</span></div>
    <div class="detail-row"><span class="key">Employment Gaps</span><span class="val">${(expA.gaps||[]).map(g=>`${g.start}→${g.end} (${g.days}d)`).join("; ")||"None"}</span></div>
    <div class="detail-row"><span class="key">Justified Gaps</span><span class="val">${(expA.justified_gaps||[]).length} justified</span></div>`;

  const analysisResHtml = `
    <div class="detail-row"><span class="key">Total Publications</span><span class="val">${resA.total||0}</span></div>
    <div class="detail-row"><span class="key">Journals</span><span class="val">${resA.journal_count||0}</span></div>
    <div class="detail-row"><span class="key">Conferences</span><span class="val">${resA.conference_count||0}</span></div>
    <div class="detail-row"><span class="key">Q1/Q2/Q3/Q4/Unknown</span><span class="val">${q.Q1||0} / ${q.Q2||0} / ${q.Q3||0} / ${q.Q4||0} / ${q.Unknown||0}</span></div>
    <div class="detail-row"><span class="key">Top Conferences</span><span class="val">${(resA.top_conferences||[]).join("; ")||"None"}</span></div>`;

  const missSection = miss.length
    ? `<div class="detail-card" style="border-color:rgba(234,179,8,.3)">
        <h4 style="color:var(--yellow)">⚠ Missing Fields</h4>
        ${miss.map(m=>`<div style="font-size:12px;color:var(--yellow);margin-bottom:5px">• ${m}</div>`).join("")}
       </div>`
    : `<div class="detail-card" style="border-color:rgba(34,197,94,.3)">
        <h4 style="color:var(--green)">✓ Complete Profile</h4>
        <p style="font-size:12px;color:var(--muted)">No missing information detected.</p>
       </div>`;

  document.getElementById("detail-content").innerHTML = `
    <div class="detail-sidebar">
      <div class="detail-card">
        <h4>Personal Info</h4>
        ${infoRows || '<p style="color:var(--muted);font-size:12px">No personal info extracted</p>'}
      </div>
      ${missSection}
    </div>
    <div>
      <div class="section-tabs">
        <button class="tab-btn active" onclick="switchTab(this,'tab-edu')">Education (${edu.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-exp')">Experience (${exp.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-pub')">Publications (${pubs.length})</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-analysis-edu')">Edu Analysis</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-analysis-exp')">Exp Analysis</button>
        <button class="tab-btn" onclick="switchTab(this,'tab-analysis-res')">Research</button>
        ${c._email ? '<button class="tab-btn" onclick="switchTab(this,\'tab-email\')">Draft Email</button>' : ""}
      </div>
      <div class="tab-pane active" id="tab-edu">
        <div class="table-card"><table><thead><tr>
          <th>Level</th><th>Degree</th><th>Grade/CGPA</th><th>Year</th><th>Institution</th>
        </tr></thead><tbody>${eduRows}</tbody></table></div></div>
      <div class="tab-pane" id="tab-exp">
        <div class="table-card"><table><thead><tr>
          <th>Post</th><th>Organization</th><th>Period</th><th>Location</th>
        </tr></thead><tbody>${expRows}</tbody></table></div></div>
      <div class="tab-pane" id="tab-pub">
        <div class="table-card"><table><thead><tr>
          <th>Title</th><th>Type</th><th>IF</th><th>Year</th><th>Published In</th>
        </tr></thead><tbody>${pubRows}</tbody></table></div></div>
      <div class="tab-pane" id="tab-analysis-edu">
        <div class="detail-card"><h4>Educational Profile Analysis</h4>${analysisEduHtml}</div></div>
      <div class="tab-pane" id="tab-analysis-exp">
        <div class="detail-card"><h4>Experience Analysis</h4>${analysisExpHtml}</div></div>
      <div class="tab-pane" id="tab-analysis-res">
        <div class="detail-card"><h4>Research Profile Analysis</h4>${analysisResHtml}</div></div>
      ${c._email ? `<div class="tab-pane" id="tab-email">
        <div class="email-preview">${c._email}</div>
        <button class="btn btn-outline" style="margin-top:10px" onclick='copyEmailText(${JSON.stringify(c._email)})'>Copy Email</button>
      </div>` : ""}
    </div>`;
}

function switchTab(btn, paneId) {
  btn.closest(".detail-grid").querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.closest(".detail-grid").querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(paneId).classList.add("active");
}

function closeDetail() {
  document.getElementById("cand-list-view").style.display   = "block";
  document.getElementById("cand-detail-view").style.display = "none";
}

function copyEmailText(text) {
  navigator.clipboard.writeText(text).then(() => alert("Email copied to clipboard!"));
}

// ─── Emails screen ────────────────────────────────────────────────────────────
function renderEmails() {
  const wrap = document.getElementById("emails-wrap");
  const withEmail = allCandidates.filter(c => c._email);
  if (!withEmail.length) {
    wrap.innerHTML = `<div class="empty"><div class="icon">✉</div>
      <h3>No draft emails</h3><p>Process CVs to generate missing-info emails.</p></div>`;
    return;
  }
  window._emailList = withEmail;
  wrap.innerHTML = `
    <div class="email-grid">
      <div class="table-card">
        ${withEmail.map((c,i) => {
          const pi = c.personal_info || {};
          return `<div class="email-list-item ${i===0?"active":""}" id="eli-${i}" onclick="showEmail(this,${i})">
            <div class="ename">${pi.name||"(unnamed)"}</div>
            <div class="emiss">${(c._missing||[]).join(", ")}</div>
          </div>`;
        }).join("")}
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:13px;font-weight:600" id="email-name">
            ${(withEmail[0].personal_info||{}).name||""}
          </h3>
          <button class="btn btn-outline" onclick="copyActiveEmail()">Copy</button>
        </div>
        <div class="email-preview" id="emailPreview">${withEmail[0]._email||""}</div>
      </div>
    </div>`;
}

function showEmail(el, i) {
  document.querySelectorAll(".email-list-item").forEach(x => x.classList.remove("active"));
  el.classList.add("active");
  const c = window._emailList[i];
  document.getElementById("emailPreview").textContent = c._email || "";
  document.getElementById("email-name").textContent   = (c.personal_info||{}).name || "";
}

function copyActiveEmail() {
  const txt = document.getElementById("emailPreview")?.textContent;
  if (txt) navigator.clipboard.writeText(txt).then(() => alert("Email copied!"));
}

// ─── Mode check ───────────────────────────────────────────────────────────────
async function checkExtractionMode() {
  try {
    const res  = await fetch("/api/mode");
    const data = await res.json();
    const badge    = document.getElementById("extraction-mode-badge");
    const imgBadge = document.getElementById("image-support-badge");

    if (data.llm_available) {
      badge.textContent = "LLM (Groq)";
      badge.style.background = "rgba(34,197,94,.15)";
      badge.style.color = "var(--green)";
    } else {
      badge.textContent = "Regex Fallback";
      badge.style.background = "rgba(234,179,8,.15)";
      badge.style.color = "var(--yellow)";
    }

    // Show capability badges
    const caps = [];
    if (data.scanned_pdf_support) caps.push("📄 Scanned PDFs");
    if (data.image_support)       caps.push("🖼 Images");
    if (caps.length) {
      imgBadge.textContent = caps.join(" · ");
      imgBadge.style.display = "inline-block";
    }
  } catch(e) {
    const badge = document.getElementById("extraction-mode-badge");
    badge.textContent = "Regex Fallback";
    badge.style.background = "rgba(234,179,8,.15)";
    badge.style.color = "var(--yellow)";
  }
}