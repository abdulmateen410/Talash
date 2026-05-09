/* ══════════════════════════════════════════════════════════════════════════
   TALASH - Main JavaScript
   MongoDB Integration + Cumulative Loading + Modern UI
   ══════════════════════════════════════════════════════════════════════════ */

let currentJobId = null;
let currentCandidates = [];
let uploadedFiles = [];
let charts = {};
let currentCandidateIndex = null;
let pendingDeleteCandidateId = null;
let pendingDeleteCandidateName = null;

function normalizeDegreeLabel(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (/phd|doctor|doctorate/.test(raw)) return 'PhD';
  if (/\b(ms|m\.s|m\.sc|mphil|master|ma|mse|m\.e|m\.eng)\b/.test(raw)) return 'MS';
  if (/\b(bs|b\.sc|bsc|b\.e|bee|b\.eng|btech|b\.tech|bachelor)\b/.test(raw)) return 'BS';
  if (/\b(fsc|a-level|alevel|hssc|intermediate|higher secondary)\b/.test(raw)) return 'FSC/A-Level';
  if (/\b(ssc|o-level|olevel|matric|high school|secondary)\b/.test(raw)) return 'SSC/O-Level';
  return String(text || '').trim() || 'N/A';
}

function getHighestDegree(education) {
  if (!Array.isArray(education) || education.length === 0) return 'N/A';
  const weights = {
    PhD: 5,
    MS: 4,
    BS: 3,
    'FSC/A-Level': 2,
    'SSC/O-Level': 1,
  };
  let highest = { weight: 0, degree: 'N/A' };
  education.forEach((entry) => {
    const label = normalizeDegreeLabel(`${entry?.level || ''} ${entry?.degree || ''}`);
    const weight = weights[label] || 0;
    if (weight > highest.weight) {
      highest = { weight, degree: label };
    }
  });
  return highest.degree;
}

function isCandidatePhD(candidate) {
  return (candidate.education || []).some((entry) => 
    normalizeDegreeLabel(`${entry?.level || ''} ${entry?.degree || ''}`) === 'PhD'
  );
}

// ══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  checkExtractionMode();
  initializeCharts();
  loadAllCandidates(); // Load all candidates from MongoDB
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    
    if (!data.username) {
      window.location.href = '/login';
      return;
    }
    
    const badge = document.getElementById('user-badge');
    if (badge) {
      badge.textContent = data.display || data.username;
    }
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

function showLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeLogoutModal() {
  const modal = document.getElementById('logoutModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function doLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (err) {
    console.error('Logout failed:', err);
  }
}

async function confirmLogout() {
  closeLogoutModal();
  await doLogout();
}

async function checkExtractionMode() {
  try {
    const res = await fetch('/api/mode');
    const data = await res.json();
    
    const badge = document.getElementById('extraction-mode-badge');
    if (badge) {
      if (data.llm_available) {
        badge.textContent = 'AI Powered';
        badge.style.background = 'rgba(52, 211, 153, 0.15)';
        badge.style.color = '#34d399';
      } else {
        badge.textContent = 'Basic Mode';
        badge.style.background = 'rgba(251, 191, 36, 0.15)';
        badge.style.color = '#fbbf24';
      }
    }
    
    const imgBadge = document.getElementById('image-support-badge');
    if (imgBadge && data.image_support) {
      imgBadge.style.display = 'inline-flex';
    }
    
    const mlBadge = document.getElementById('sklearn-support-badge');
    if (mlBadge && data.sklearn_available) {
      mlBadge.style.display = 'inline-flex';
    }
    
    const mongoBadge = document.getElementById('mongodb-support-badge');
    if (mongoBadge && data.mongodb_available) {
      mongoBadge.style.display = 'inline-flex';
      mongoBadge.textContent = 'MongoDB';
    }
  } catch (err) {
    console.error('Mode check failed:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════════════

function showScreen(name) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const clickedItem = document.querySelector(`.nav-item[data-screen="${name}"]`);
  if (clickedItem) {
    clickedItem.classList.add('active');
  }
  
  // Update screens
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById(`screen-${name}`)?.classList.add('active');
  
  // Update topbar
  const titles = {
    dashboard: ['Dashboard', 'CV Extraction & Comprehensive Analysis'],
    upload: ['Upload CVs', 'Process and analyze candidate documents'],
    rankings: ['Candidate Rankings', 'Comprehensive scoring and evaluation'],
    candidates: ['Candidate Profiles', 'Detailed candidate information'],
    analytics: ['Analytics', 'Research & professional insights'],
    emails: ['Draft Emails', 'Missing information requests']
  };
  
  const [title, sub] = titles[name] || ['', ''];
  document.getElementById('topbar-title').textContent = title;
  document.getElementById('topbar-sub').textContent = sub;
  
  // Load data if needed
  if (name === 'analytics' && currentCandidates.length > 0) {
    updateAnalytics();
  }
}

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('collapsed');
}

// ══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════════════════

function handleFileSelect(files) {
  if (!files || files.length === 0) return;
  
  uploadedFiles = [...files];
  updateQueueUI();
  
  const processBtn = document.getElementById('processBtn');
  processBtn.disabled = false;
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const dropZone = document.getElementById('dropZone');
  dropZone.classList.remove('drag-over');
  
  const files = e.dataTransfer?.files;
  if (files) {
    handleFileSelect(files);
  }
}

function updateQueueUI() {
  const list = document.getElementById('queueList');
  const count = document.getElementById('queue-count');
  
  if (uploadedFiles.length === 0) {
    list.innerHTML = `
      <div class="empty" style="padding:30px">
        <div class="empty-icon" style="width:40px;height:40px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <p>No files added</p>
      </div>`;
    count.textContent = '';
    return;
  }
  
  count.textContent = `(${uploadedFiles.length})`;
  
  list.innerHTML = uploadedFiles.map((f, i) => `
    <div class="queue-item">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
      <span style="color:var(--text-muted);font-size:11px">${formatFileSize(f.size)}</span>
      <button onclick="removeFile(${i})" 
              style="background:transparent;border:none;color:var(--red);cursor:pointer;padding:4px;font-size:18px">
        ×
      </button>
    </div>
  `).join('');
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  updateQueueUI();
  
  if (uploadedFiles.length === 0) {
    document.getElementById('processBtn').disabled = true;
  }
}

function clearQueue() {
  uploadedFiles = [];
  updateQueueUI();
  document.getElementById('processBtn').disabled = true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ══════════════════════════════════════════════════════════════════════════
// PROCESSING
// ══════════════════════════════════════════════════════════════════════════

async function startProcessing() {
  if (uploadedFiles.length === 0) return;
  
  const formData = new FormData();
  uploadedFiles.forEach(f => formData.append('files', f));
  
  const processBtn = document.getElementById('processBtn');
  processBtn.disabled = true;
  processBtn.textContent = 'Processing...';
  
  // Show processing spinner
  const processingStatus = document.getElementById('processingStatus');
  processingStatus.style.display = 'flex';
  
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    
    if (res.ok) {
      currentJobId = data.job_id;
      pollJobStatus();
    } else {
      alert(`Error: ${data.error}`);
      processBtn.disabled = false;
      processBtn.textContent = 'Process & Analyze';
      processingStatus.style.display = 'none';
    }
  } catch (err) {
    alert(`Upload failed: ${err.message}`);
    processBtn.disabled = false;
    processBtn.textContent = 'Process & Analyze';
    processingStatus.style.display = 'none';
  }
}

async function pollJobStatus() {
  if (!currentJobId) return;
  
  try {
    const res = await fetch(`/api/status/${currentJobId}`);
    const data = await res.json();
    
    if (!res.ok) {
      console.error(`Error: ${data.error}`);
      return;
    }
    
    if (data.status === 'done') {
      document.getElementById('processBtn').textContent = 'Process & Analyze';
      document.getElementById('processBtn').disabled = false;
      document.getElementById('processingStatus').style.display = 'none';
      
      // Show download box
      const downloadBox = document.getElementById('downloadBox');
      downloadBox.style.display = 'block';
      
      // Reload all candidates from MongoDB (cumulative)
      await loadAllCandidates();
      
      // Clear queue
      clearQueue();
      
    } else if (data.status === 'error') {
      alert(`Error: ${data.error}`);
      document.getElementById('processBtn').disabled = false;
      document.getElementById('processBtn').textContent = 'Process & Analyze';
      document.getElementById('processingStatus').style.display = 'none';
      
      // Still attempt to load any partial results
      await loadAllCandidates();
      
    } else {
      // Still running
      setTimeout(pollJobStatus, 2000);
    }
  } catch (err) {
    console.error(`Status check failed: ${err.message}`);
  }
}

async function loadAllCandidates() {
  try {
    const res = await fetch('/api/candidates');
    const data = await res.json();
    
    if (res.ok) {
      currentCandidates = data;
      updateDashboard();
      updateRankings();
      updateCandidatesList();
      updateEmails();
      updateAnalytics();
    }
  } catch (err) {
    console.error('Failed to load candidates:', err);
  }
}

function downloadFile(type) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/api/status/${currentJobId}`, false);
  xhr.send();
  
  const data = JSON.parse(xhr.responseText);
  const filename = type === 'xlsx' ? data.xlsx : data.json;
  
  if (filename) {
    window.location.href = `/api/download/${filename}`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

function updateDashboard() {
  if (currentCandidates.length === 0) return;
  
  const total = currentCandidates.length;
  const phd = currentCandidates.filter(c => isCandidatePhD(c)).length;
  const withPub = currentCandidates.filter(c => 
    (c.publications || []).length > 0
  ).length;
  const excellent = currentCandidates.filter(c => 
    (c.ranking?.ranking_tier || '') === 'Excellent'
  ).length;
  
  const avgScore = currentCandidates.reduce((sum, c) => 
    sum + (c.ranking?.total_score || 0), 0
  ) / total;
  
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-total-sub').textContent = 'Candidates analyzed';
  document.getElementById('stat-excellent').textContent = excellent;
  document.getElementById('stat-avg').textContent = avgScore.toFixed(1);
  document.getElementById('stat-phd').textContent = phd;
  document.getElementById('stat-phd-sub').textContent = `${withPub} with publications`;
  
  updateDashboardCharts();
  updateDashboardTable();
}

function updateDashboardCharts() {
  const tierCounts = {
    'Excellent': 0,
    'Very Good': 0,
    'Good': 0,
    'Fair': 0,
    'Needs Improvement': 0
  };
  
  currentCandidates.forEach(c => {
    const tier = c.ranking?.ranking_tier || 'Needs Improvement';
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  });
  
  updateChart('chartRankings', {
    type: 'doughnut',
    data: {
      labels: Object.keys(tierCounts),
      datasets: [{
        data: Object.values(tierCounts),
        backgroundColor: [
          'rgba(52, 211, 153, 0.8)',
          'rgba(96, 165, 250, 0.8)',
          'rgba(167, 139, 250, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(248, 113, 113, 0.8)'
        ],
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: 'rgba(255, 255, 255, 0.8)', padding: 15 }
        }
      }
    }
  });
  
  const avgScores = {
    education: 0,
    research: 0,
    experience: 0,
    skills: 0,
    collaboration: 0
  };
  
  currentCandidates.forEach(c => {
    const r = c.ranking || {};
    avgScores.education += r.education_score || 0;
    avgScores.research += r.research_score || 0;
    avgScores.experience += r.experience_score || 0;
    avgScores.skills += r.skills_score || 0;
    avgScores.collaboration += r.collaboration_score || 0;
  });
  
  const count = currentCandidates.length || 1;
  Object.keys(avgScores).forEach(k => avgScores[k] /= count);
  
  updateChart('chartScores', {
    type: 'radar',
    data: {
      labels: ['Education', 'Research', 'Experience', 'Skills', 'Collaboration'],
      datasets: [{
        label: 'Average Scores',
        data: Object.values(avgScores),
        backgroundColor: 'rgba(102, 126, 234, 0.2)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(102, 126, 234, 1)',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(102, 126, 234, 1)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: { color: 'rgba(255, 255, 255, 0.5)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          pointLabels: { color: 'rgba(255, 255, 255, 0.8)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateDashboardTable() {
  const wrap = document.getElementById('dash-table-wrap');
  
  const sorted = [...currentCandidates].sort((a, b) => 
    (b.ranking?.total_score || 0) - (a.ranking?.total_score || 0)
  );
  
  const top = sorted.slice(0, 10);
  
  const html = `
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Position</th>
          <th>Score</th>
          <th>Tier</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${top.map((c, i) => {
          const name = c.personal_info?.name || 'Unknown';
          const post = c.personal_info?.post_applied || 'N/A';
          const score = c.ranking?.total_score || 0;
          const tier = c.ranking?.ranking_tier || 'Unknown';
          const tierClass = tier.toLowerCase().replace(/\s+/g, '-');
          const candIndex = currentCandidates.findIndex(x => x._id === c._id);
          
          return `
            <tr>
              <td><strong>${i + 1}</strong></td>
              <td>${name}</td>
              <td style="color:var(--text-muted)">${post}</td>
              <td><strong style="color:var(--accent)">${score.toFixed(1)}</strong></td>
              <td><span class="score-tier tier-${tierClass}">${tier}</span></td>
              <td><button class="btn btn-outline" style="padding:6px 14px;font-size:12px" 
                          onclick="showCandidateDetail(${candIndex})">View</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  wrap.innerHTML = html;
}

function filterTable(query) {
  const rows = document.querySelectorAll('#dash-table-wrap tbody tr');
  const q = query.toLowerCase();
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

// ══════════════════════════════════════════════════════════════════════════
// RANKINGS
// ══════════════════════════════════════════════════════════════════════════

function updateRankings() {
  const wrap = document.getElementById('rankings-list');
  const count = document.getElementById('rank-count');
  
  if (currentCandidates.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
        </div>
        <h3>No rankings available</h3>
        <p>Process CVs to generate rankings.</p>
      </div>`;
    count.textContent = '';
    return;
  }
  
  const sorted = [...currentCandidates].sort((a, b) => 
    (b.ranking?.total_score || 0) - (a.ranking?.total_score || 0)
  );
  
  count.textContent = `${sorted.length} candidate${sorted.length !== 1 ? 's' : ''}`;
  
  wrap.innerHTML = sorted.map((c, i) => {
    const name = c.personal_info?.name || 'Unknown';
    const post = c.personal_info?.post_applied || 'Position not specified';
    const r = c.ranking || {};
    const tier = r.ranking_tier || 'Unknown';
    const tierClass = tier.toLowerCase().replace(/\s+/g, '-');
    
    return `
      <div class="rank-card">
        <div class="rank-header">
          <div style="display:flex;gap:16px;align-items:start">
            <div class="rank-number">${i + 1}</div>
            <div class="rank-info">
              <h4>${name}</h4>
              <p>${post}</p>
            </div>
          </div>
          <div class="rank-score">
            <div class="score-value" style="color:var(--accent)">${(r.total_score || 0).toFixed(1)}</div>
            <span class="score-tier tier-${tierClass}">${tier}</span>
          </div>
        </div>
        <div class="score-breakdown">
          <div class="score-item">
            <div class="score-item-label">Education</div>
            <div class="score-item-value" style="color:var(--green)">${(r.education_score || 0).toFixed(0)}</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Research</div>
            <div class="score-item-value" style="color:var(--blue)">${(r.research_score || 0).toFixed(0)}</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Experience</div>
            <div class="score-item-value" style="color:var(--purple)">${(r.experience_score || 0).toFixed(0)}</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Skills</div>
            <div class="score-item-value" style="color:var(--yellow)">${(r.skills_score || 0).toFixed(0)}</div>
          </div>
          <div class="score-item">
            <div class="score-item-label">Collab</div>
            <div class="score-item-value" style="color:var(--pink)">${(r.collaboration_score || 0).toFixed(0)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterRankings(query) {
  const cards = document.querySelectorAll('.rank-card');
  const q = query.toLowerCase();
  
  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(q) ? '' : 'none';
  });
}

function sortRankings(by) {
  let sorted = [...currentCandidates];
  
  switch (by) {
    case 'education':
      sorted.sort((a, b) => (b.ranking?.education_score || 0) - (a.ranking?.education_score || 0));
      break;
    case 'research':
      sorted.sort((a, b) => (b.ranking?.research_score || 0) - (a.ranking?.research_score || 0));
      break;
    case 'experience':
      sorted.sort((a, b) => (b.ranking?.experience_score || 0) - (a.ranking?.experience_score || 0));
      break;
    default:
      sorted.sort((a, b) => (b.ranking?.total_score || 0) - (a.ranking?.total_score || 0));
  }
  
  currentCandidates = sorted;
  updateRankings();
}

// ══════════════════════════════════════════════════════════════════════════
// CANDIDATES
// ══════════════════════════════════════════════════════════════════════════

function updateCandidatesList() {
  const wrap = document.getElementById('cand-table-wrap');
  const count = document.getElementById('cand-count');
  
  if (currentCandidates.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <h3>No candidates loaded</h3>
        <p>Upload and process CVs first.</p>
      </div>`;
    count.textContent = '';
    return;
  }
  
  count.textContent = `${currentCandidates.length} candidate${currentCandidates.length !== 1 ? 's' : ''}`;
  
  const html = `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Highest Degree</th>
          <th>Publications</th>
          <th>Experience</th>
          <th>Score</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${currentCandidates.map((c, i) => {
          const name = c.personal_info?.name || 'Unknown';
          const email = c.personal_info?.email || 'N/A';
          const edu = c.education || [];
          const degree = getHighestDegree(edu);
          const pubs = (c.publications || []).length;
          const exp = c.analyses?.experience_analysis?.total_years || 0;
          const score = c.ranking?.total_score || 0;
          
          return `
            <tr onclick="showCandidateDetail(${i})" style="cursor:pointer">
              <td><strong>${name}</strong></td>
              <td style="color:var(--text-muted);font-size:12px">${email}</td>
              <td>${degree}</td>
              <td>${pubs}</td>
              <td>${exp} years</td>
              <td><strong style="color:var(--accent)">${score.toFixed(1)}</strong></td>
              <td style="display:flex;gap:8px" onclick="event.stopPropagation()">
                <button class="btn btn-outline" style="padding:6px 14px;font-size:12px" onclick="showCandidateDetail(${i})">View</button>
                <button type="button" class="btn btn-danger" style="padding:6px 14px;font-size:12px" onclick="deleteCandidate(event, ${i})">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  wrap.innerHTML = html;
}

function filterCandidates(query) {
  const rows = document.querySelectorAll('#cand-table-wrap tbody tr');
  const q = query.toLowerCase();
  
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function showCandidateDetail(index) {
  const c = currentCandidates[index];
  if (!c) return;
  
  currentCandidateIndex = index;
  document.getElementById('cand-list-view').style.display = 'none';
  document.getElementById('cand-detail-view').style.display = 'block';
  
  const name = c.personal_info?.name || 'Unknown';
  const ranking = c.ranking || {};
  const analyses = c.analyses || {};
  
  const html = `
    <div class="detail-section">
      <h3>Overall Assessment</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:16px">
        <div>
          <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px">Total Score</div>
          <div style="font-size:32px;font-weight:700;color:var(--accent)">${(ranking.total_score || 0).toFixed(1)}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px">Tier</div>
          <div style="font-size:18px;font-weight:600">${ranking.ranking_tier || 'Unknown'}</div>
        </div>
        <div>
          <div style="color:var(--text-muted);font-size:12px;margin-bottom:4px">Recommendation</div>
          <div style="font-size:16px">${c.summary?.recommendation || 'N/A'}</div>
        </div>
      </div>
    </div>
    
    <div class="detail-section">
      <h3>Summary</h3>
      <p style="line-height:1.8;color:var(--text-secondary)">${c.summary?.assessment || 'No summary available'}</p>
    </div>
    
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div class="detail-section">
        <h3>Strengths</h3>
        <ul style="margin-left:20px;line-height:2">
          ${(c.summary?.strengths || []).map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
      <div class="detail-section">
        <h3>Concerns</h3>
        <ul style="margin-left:20px;line-height:2;color:var(--text-muted)">
          ${(c.summary?.concerns || []).map(s => `<li>${s}</li>`).join('')}
        </ul>
      </div>
    </div>
    
    <div class="detail-section">
      <h3>Education</h3>
      ${(c.education || []).map(e => `
        <div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <strong>${e.degree || 'Unknown'}</strong> — ${e.institution || 'Unknown'}
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            ${e.grade_cgpa_percentage || 'N/A'} | ${e.passing_year || 'N/A'}
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="detail-section">
      <h3>Publications (${(c.publications || []).length})</h3>
      ${(c.publications || []).slice(0, 10).map(p => `
        <div style="margin-bottom:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px">
          <strong style="font-size:14px">${p.title || 'Untitled'}</strong>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
            ${p.published_in || 'Unknown'} | ${p.year || 'N/A'} | ${p.type || 'Unknown'}
          </div>
        </div>
      `).join('')}
    </div>
    
    <div class="detail-section">
      <h3>Research Analysis</h3>
      <div style="display:grid;gap:12px">
        <div>
          <strong>Topic Focus:</strong> ${analyses.topic_variability?.focus || 'Unknown'}
        </div>
        <div>
          <strong>Collaboration Score:</strong> ${analyses.coauthorship_analysis?.collaboration_score || 0}
        </div>
        <div>
          <strong>Total Co-authors:</strong> ${analyses.coauthorship_analysis?.total_coauthors || 0}
        </div>
      </div>
    </div>
    
    <div style="margin-top:32px;display:flex;gap:12px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px">
      <button class="btn btn-danger" style="flex:1" onclick="deleteCandidate()">
        <svg style="width:16px;height:16px;vertical-align:middle;margin-right:8px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Delete Candidate
      </button>
    </div>
  `;
  
  document.getElementById('detail-content').innerHTML = html;
}

function closeDetail() {
  document.getElementById('cand-list-view').style.display = 'block';
  document.getElementById('cand-detail-view').style.display = 'none';
  currentCandidateIndex = null;
}

function showDeleteModal(candidateId, candidateName) {
  pendingDeleteCandidateId = candidateId;
  pendingDeleteCandidateName = candidateName;
  document.getElementById('deleteModalName').textContent = candidateName;
  document.getElementById('deleteModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteModal').style.display = 'none';
  pendingDeleteCandidateId = null;
  pendingDeleteCandidateName = null;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

async function confirmDelete() {
  if (!pendingDeleteCandidateId) {
    showToast('No candidate selected for deletion.', 'error');
    return;
  }
  
  try {
    const res = await fetch(`/api/candidate/${pendingDeleteCandidateId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await res.json();
    
    if (data.ok || res.ok) {
      const deletedName = pendingDeleteCandidateName;
      closeDetail();
      closeDeleteModal();
      await loadAllCandidates();
      showToast(`${deletedName} has been deleted successfully.`, 'success');
    } else {
      showToast('Error deleting candidate: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    showToast('Error deleting candidate: ' + err.message, 'error');
  }
}

async function deleteCandidate(eventOrIndex = null, index = null) {
  if (eventOrIndex instanceof Event) {
    eventOrIndex.stopPropagation();
    currentCandidateIndex = index;
  } else if (typeof eventOrIndex === 'number') {
    currentCandidateIndex = eventOrIndex;
  }

  if (currentCandidateIndex === null) return;

  const c = currentCandidates[currentCandidateIndex];
  if (!c) return;

  const candidateId = c._id || c.id || c.candidate_id || c.candidateId;
  const name = c.personal_info?.name || 'Unknown';

  if (!candidateId) {
    showToast('Unable to identify candidate to delete.', 'error');
    return;
  }

  showDeleteModal(candidateId, name);
}

// ══════════════════════════════════════════════════════════════════════════
// ANALYTICS
// ══════════════════════════════════════════════════════════════════════════

function updateAnalytics() {
  if (currentCandidates.length === 0) return;
  
  updateAnalyticsCharts();
  updateInsights();
}

function updateAnalyticsCharts() {
  const pubQuality = { 'High': 0, 'Medium': 0, 'Low': 0 };
  currentCandidates.forEach(c => {
    const score = c.ranking?.research_score || 0;
    if (score >= 70) pubQuality['High']++;
    else if (score >= 40) pubQuality['Medium']++;
    else pubQuality['Low']++;
  });
  
  updateChart('chartPubQuality', {
    type: 'bar',
    data: {
      labels: Object.keys(pubQuality),
      datasets: [{
        label: 'Candidates',
        data: Object.values(pubQuality),
        backgroundColor: [
          'rgba(52, 211, 153, 0.8)',
          'rgba(96, 165, 250, 0.8)',
          'rgba(248, 113, 113, 0.8)'
        ],
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'rgba(255, 255, 255, 0.5)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
  
  const collabScores = currentCandidates.map(c => 
    c.analyses?.coauthorship_analysis?.collaboration_score || 0
  );
  
  updateChart('chartCollaboration', {
    type: 'line',
    data: {
      labels: currentCandidates.map((c, i) => `C${i + 1}`),
      datasets: [{
        label: 'Collaboration Score',
        data: collabScores,
        borderColor: 'rgba(167, 139, 250, 1)',
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: 'rgba(255, 255, 255, 0.5)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
  
  const diversityData = currentCandidates.map(c => 
    c.analyses?.topic_variability?.diversity_score || 0
  );
  
  updateChart('chartTopicDiversity', {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Diversity Score',
        data: diversityData.map((score, i) => ({ x: i + 1, y: score })),
        backgroundColor: 'rgba(79, 172, 254, 0.6)',
        borderColor: 'rgba(79, 172, 254, 1)',
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'rgba(255, 255, 255, 0.5)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
  
  const expYears = currentCandidates.map(c => 
    c.analyses?.experience_analysis?.total_years || 0
  );
  
  updateChart('chartExperience', {
    type: 'bar',
    data: {
      labels: currentCandidates.map((c, i) => `C${i + 1}`),
      datasets: [{
        label: 'Years',
        data: expYears,
        backgroundColor: 'rgba(251, 191, 36, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: 'rgba(255, 255, 255, 0.5)' },
          grid: { color: 'rgba(255, 255, 255, 0.1)' }
        },
        x: {
          ticks: { color: 'rgba(255, 255, 255, 0.8)' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function updateInsights() {
  const avgEduScore = currentCandidates.reduce((sum, c) => 
    sum + (c.ranking?.education_score || 0), 0
  ) / currentCandidates.length;
  
  const phdCount = currentCandidates.filter(c => 
    (c.education || []).some(e => (e.level || '').toLowerCase() === 'phd')
  ).length;
  
  document.getElementById('edu-insights').innerHTML = `
    <p><strong>Average Education Score:</strong> ${avgEduScore.toFixed(1)}/100</p>
    <p><strong>PhD Holders:</strong> ${phdCount} (${((phdCount / currentCandidates.length) * 100).toFixed(0)}%)</p>
    <p><strong>Highest Qualification:</strong> Majority hold ${phdCount > currentCandidates.length / 2 ? 'PhD' : 'Master\'s'} degrees</p>
  `;
  
  const avgPubs = currentCandidates.reduce((sum, c) => 
    sum + (c.publications || []).length, 0
  ) / currentCandidates.length;
  
  document.getElementById('research-insights').innerHTML = `
    <p><strong>Average Publications:</strong> ${avgPubs.toFixed(1)} per candidate</p>
    <p><strong>Total Publications:</strong> ${currentCandidates.reduce((sum, c) => sum + (c.publications || []).length, 0)}</p>
    <p><strong>Research Active:</strong> ${currentCandidates.filter(c => (c.publications || []).length > 0).length} candidates</p>
  `;
  
  const avgExp = currentCandidates.reduce((sum, c) => 
    sum + (c.analyses?.experience_analysis?.total_years || 0), 0
  ) / currentCandidates.length;
  
  document.getElementById('exp-insights').innerHTML = `
    <p><strong>Average Experience:</strong> ${avgExp.toFixed(1)} years</p>
    <p><strong>Experience Range:</strong> ${Math.min(...currentCandidates.map(c => c.analyses?.experience_analysis?.total_years || 0)).toFixed(0)} - ${Math.max(...currentCandidates.map(c => c.analyses?.experience_analysis?.total_years || 0)).toFixed(0)} years</p>
  `;
}

// ══════════════════════════════════════════════════════════════════════════
// EMAILS
// ══════════════════════════════════════════════════════════════════════════

function updateEmails() {
  const wrap = document.getElementById('emails-wrap');
  
  const withMissing = currentCandidates.filter(c => c._missing && c._missing.length > 0);
  
  if (withMissing.length === 0) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
        </div>
        <h3>No draft emails</h3>
        <p>All candidate profiles are complete.</p>
      </div>`;
    return;
  }
  
  wrap.innerHTML = withMissing.map(c => {
    const name = c.personal_info?.name || 'Unknown';
    const email = c.personal_info?.email || 'no-email@example.com';
    
    return `
      <div class="email-card">
        <div class="email-header">
          <div>
            <div class="email-to"><strong>To:</strong> ${name}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${email}</div>
          </div>
          <button class="btn btn-outline" onclick="copyEmail(this)" style="padding:6px 14px;font-size:12px">
            Copy Email
          </button>
        </div>
        <div class="email-body">${c._email || 'No email generated'}</div>
      </div>
    `;
  }).join('');
}

function copyEmail(btn) {
  const emailBody = btn.closest('.email-card').querySelector('.email-body').textContent;
  navigator.clipboard.writeText(emailBody);
  
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  btn.style.background = 'rgba(52, 211, 153, 0.2)';
  btn.style.color = 'var(--green)';
  
  setTimeout(() => {
    btn.textContent = orig;
    btn.style.background = '';
    btn.style.color = '';
  }, 2000);
}

// ══════════════════════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════════════════════

function initializeCharts() {
  Chart.defaults.color = 'rgba(255, 255, 255, 0.8)';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
  Chart.defaults.font.family = "'DM Sans', sans-serif";
}

function updateChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  
  if (charts[canvasId]) {
    charts[canvasId].destroy();
  }
  
  charts[canvasId] = new Chart(canvas, config);
}