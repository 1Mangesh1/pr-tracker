/**
 * GitHub PR Tracker - Frontend Application
 * Communicates with Cloudflare Worker backend
 */

// API Base URL (will be same origin when deployed)
const API_BASE = "/api";

// Application state
let allPRs = []; // Full list of PRs
let filteredPRs = []; // Filtered PRs based on active filters
let filters = {
  domain: "",
  status: "",
  repo: "",
};

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  setDefaultDates();
});

// ===== Event Listeners =====

function setupEventListeners() {
  // Search button
  document.getElementById("fetchBtn").addEventListener("click", handleFetchAndSummarize);

  // Quick query buttons
  document.querySelectorAll("[data-query]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.getElementById("searchQuery").value = e.target.dataset.query;
    });
  });

  // Filter chips
  document.querySelectorAll(".chip[data-filter]").forEach((chip) => {
    chip.addEventListener("click", handleFilterChange);
  });

  // Repo filter input
  document.getElementById("repoFilter").addEventListener("input", (e) => {
    filters.repo = e.target.value.toLowerCase();
    applyFilters();
  });

  // Export and report buttons
  document.getElementById("exportCSVBtn").addEventListener("click", exportToCSV);
  document.getElementById("generateReportBtn").addEventListener("click", generateReport);
}

function setDefaultDates() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1); // 1 year ago

  document.getElementById("startDate").valueAsDate = startDate;
  document.getElementById("endDate").valueAsDate = endDate;
}

// ===== API Calls =====

async function fetchAndSummarizePRs() {
  const searchQuery = document.getElementById("searchQuery").value.trim();
  const maxResults = parseInt(document.getElementById("maxResults").value) || 50;

  if (!searchQuery) {
    showError("Please enter a search query");
    return;
  }

  showLoading("Fetching and summarizing PRs...");

  try {
    const response = await fetch(`${API_BASE}/batch-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        startDate: document.getElementById("startDate").value,
        endDate: document.getElementById("endDate").value,
        maxResults,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Failed to fetch PRs");
    }

    const result = data.data;
    allPRs = result.summaries || [];

    if (allPRs.length === 0) {
      showEmpty();
      hideLoading();
      return;
    }

    applyFilters();
    renderStats();
    renderResults();
    showFilters();
    hideLoading();
  } catch (error) {
    showError(`Error: ${error.message || "Failed to process PRs"}`);
    hideLoading();
  }
}

// ===== Filters =====

function handleFilterChange(e) {
  const chip = e.target;
  const filterType = chip.dataset.filter;
  const value = chip.dataset.value || chip.getAttribute("value") || "";

  // Remove active class from all chips of same type
  document.querySelectorAll(`.chip[data-filter="${filterType}"]`).forEach((c) => {
    c.classList.remove("active");
  });

  // Add active class to clicked chip
  chip.classList.add("active");

  // Update filter
  filters[filterType] = value;
  applyFilters();
}

function applyFilters() {
  filteredPRs = allPRs.filter((pr) => {
    if (filters.domain && pr.domain !== filters.domain) return false;
    if (filters.status && pr.state !== filters.status) return false;
    if (filters.repo && !pr.repoName.toLowerCase().includes(filters.repo)) {
      return false;
    }
    return true;
  });

  renderResults();
  updateStats();
}

// ===== Rendering =====

function renderResults() {
  const container = document.getElementById("resultsContainer");
  container.innerHTML = "";

  if (filteredPRs.length === 0) {
    showEmpty();
    return;
  }

  // Group by domain
  const grouped = groupBy(filteredPRs, "domain");
  const domains = [
    "Backend",
    "Frontend",
    "DevOps",
    "Infra",
    "Fullstack",
    "Testing",
    "Docs",
    "Other",
  ];

  for (const domain of domains) {
    if (!grouped[domain]) continue;

    const domainGroup = document.createElement("div");
    domainGroup.className = "domain-group";

    const domainHeader = document.createElement("h3");
    domainHeader.className = "domain-header";
    domainHeader.textContent = `${domain} (${grouped[domain].length})`;
    domainHeader.style.marginTop = "24px";
    domainHeader.style.marginBottom = "12px";
    domainHeader.style.fontSize = "14px";
    domainHeader.style.fontWeight = "600";
    domainHeader.style.color = "var(--color-text-secondary)";
    domainHeader.style.textTransform = "uppercase";
    domainHeader.style.letterSpacing = "0.5px";

    domainGroup.appendChild(domainHeader);

    for (const pr of grouped[domain]) {
      domainGroup.appendChild(createPRCard(pr));
    }

    container.appendChild(domainGroup);
  }
}

function createPRCard(pr) {
  const card = document.createElement("div");
  card.className = "pr-card";

  const icon = getPRIconForDomain(pr.domain);

  card.innerHTML = `
    <div class="pr-card-icon">${icon}</div>
    <div class="pr-card-content" style="flex: 1;">
      <div class="pr-card-header">
        <h3 class="pr-card-title">
          <a href="${pr.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(pr.title)}</a>
        </h3>
      </div>
      <div class="pr-card-meta">
        <span class="pr-repo-name">${escapeHtml(pr.repoName)}</span>
        <span class="pr-date">#${pr.prNumber}</span>
        <span class="pr-date">${formatDate(pr.createdAt)}</span>
      </div>
      <p class="pr-summary">${escapeHtml(pr.summary)}</p>
      <div class="pr-footer">
        <span class="domain-badge ${pr.domain}">${pr.domain}</span>
        <span class="status-badge ${pr.state}">${formatStatus(pr.state)}</span>
        ${pr.tags.length > 0 ? `<div class="tag-list">${pr.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </div>
    </div>
  `;

  return card;
}

function renderStats() {
  document.getElementById("statsSection").classList.remove("hidden");

  // Count stats
  const merged = filteredPRs.filter((p) => p.state === "merged").length;
  const open = filteredPRs.filter((p) => p.state === "open").length;
  const closed = filteredPRs.filter((p) => p.state === "closed").length;

  document.getElementById("totalPRs").textContent = filteredPRs.length;
  document.getElementById("statMerged").textContent = merged;
  document.getElementById("statOpen").textContent = open;
  document.getElementById("statClosed").textContent = closed;

  // Domain chart
  renderDomainChart();

  // Tech tags
  renderTechTags();
}

function updateStats() {
  // This just updates the already visible stats
  renderStats();
}

function renderDomainChart() {
  const grouped = groupBy(filteredPRs, "domain");
  const domainChart = document.getElementById("domainChart");
  domainChart.innerHTML = "";

  if (Object.keys(grouped).length === 0) return;

  const domains = Object.keys(grouped).sort(
    (a, b) => grouped[b].length - grouped[a].length
  );
  const maxCount = Math.max(...domains.map((d) => grouped[d].length));

  for (const domain of domains) {
    const count = grouped[domain].length;
    const percentage = (count / maxCount) * 100;

    const bar = document.createElement("div");
    bar.className = "domain-bar";
    bar.innerHTML = `
      <div class="domain-bar-count">${count}</div>
      <div class="domain-bar-fill" style="--bar-color: var(--color-domain-${domain.toLowerCase()}); height: ${percentage}%;" title="${domain}: ${count}"></div>
      <div class="domain-bar-label">${domain}</div>
    `;
    domainChart.appendChild(bar);
  }
}

function renderTechTags() {
  const techCount = {};

  for (const pr of filteredPRs) {
    for (const tag of pr.tags) {
      techCount[tag] = (techCount[tag] || 0) + 1;
    }
  }

  const sorted = Object.entries(techCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  const container = document.getElementById("techTags");
  container.innerHTML = sorted
    .map(([tag, count]) => `<span class="tag">${escapeHtml(tag)} (${count})</span>`)
    .join("");
}

// ===== Reports & Export =====

function generateReport() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  const grouped = groupBy(filteredPRs, "domain");
  const techCount = {};

  for (const pr of filteredPRs) {
    for (const tag of pr.tags) {
      techCount[tag] = (techCount[tag] || 0) + 1;
    }
  }

  const topTechs = Object.entries(techCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  let report = `# GitHub PR Appraisal Report\n\n`;
  report += `**Period:** ${startDate || "N/A"} to ${endDate || "N/A"}\n\n`;
  report += `**Generated:** ${new Date().toLocaleString()}\n\n`;

  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `- **Total PRs:** ${filteredPRs.length}\n`;
  report += `- **Merged:** ${filteredPRs.filter((p) => p.state === "merged").length}\n`;
  report += `- **Open:** ${filteredPRs.filter((p) => p.state === "open").length}\n`;
  report += `- **Closed:** ${filteredPRs.filter((p) => p.state === "closed").length}\n\n`;

  report += `## By Domain\n\n`;
  const domains = [
    "Backend",
    "Frontend",
    "DevOps",
    "Infra",
    "Fullstack",
    "Testing",
    "Docs",
  ];
  for (const domain of domains) {
    if (grouped[domain]) {
      report += `- **${domain}:** ${grouped[domain].length} PRs\n`;
    }
  }

  report += `\n## Key Contributions\n\n`;
  const topPRs = filteredPRs
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  for (let i = 0; i < topPRs.length; i++) {
    const pr = topPRs[i];
    report += `${i + 1}. **${pr.title}** _(${pr.domain}, ${pr.repoName})_\n   ${pr.summary}\n\n`;
  }

  report += `## Technologies Used\n\n`;
  report += topTechs.join(", ") + "\n\n";

  report += `---\n\n`;
  report += `*Generated by PR Tracker*\n`;

  // Show modal with report
  const textarea = document.getElementById("reportText");
  textarea.value = report;
  document.getElementById("reportModal").classList.remove("hidden");
}

function exportToCSV() {
  const rows = [
    [
      "PR Number",
      "Title",
      "Repository",
      "Status",
      "Domain",
      "Summary",
      "Tags",
      "Created Date",
      "URL",
    ],
  ];

  for (const pr of filteredPRs) {
    rows.push([
      pr.prNumber,
      pr.title,
      pr.repoName,
      pr.state,
      pr.domain,
      pr.summary,
      pr.tags.join("; "),
      pr.createdAt,
      pr.url,
    ]);
  }

  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  const filename = `pr-tracker-${new Date().toISOString().split("T")[0]}.csv`;
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===== Modal =====

function closeReportModal() {
  document.getElementById("reportModal").classList.add("hidden");
}

function copyReportToClipboard() {
  const textarea = document.getElementById("reportText");
  textarea.select();
  document.execCommand("copy");

  const btn = event.target;
  const originalText = btn.textContent;
  btn.textContent = "✓ Copied!";
  setTimeout(() => {
    btn.textContent = originalText;
  }, 2000);
}

function downloadReport() {
  const text = document.getElementById("reportText").value;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  const filename = `pr-appraisal-${new Date().toISOString().split("T")[0]}.md`;
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ===== UI State Management =====

async function handleFetchAndSummarize() {
  const btn = document.getElementById("fetchBtn");
  btn.disabled = true;

  const spinner = btn.querySelector(".btn-spinner");
  const text = btn.querySelector(".btn-text");

  text.classList.add("hidden");
  spinner.classList.remove("hidden");

  await fetchAndSummarizePRs();

  btn.disabled = false;
  text.classList.remove("hidden");
  spinner.classList.add("hidden");
}

function showLoading(message = "Loading...") {
  const loadingState = document.getElementById("loadingState");
  document.getElementById("loadingText").textContent = message;
  loadingState.classList.remove("hidden");
  document.getElementById("resultsSection").classList.remove("hidden");
}

function hideLoading() {
  document.getElementById("loadingState").classList.add("hidden");
}

function showFilters() {
  document.getElementById("filtersSection").classList.remove("hidden");
}

function showEmpty() {
  document.getElementById("emptyState").classList.remove("hidden");
  document.getElementById("resultsContainer").innerHTML = "";
}

function showError(message) {
  const errorState = document.getElementById("errorState");
  document.getElementById("errorMessage").textContent = message;
  errorState.classList.remove("hidden");
  document.getElementById("resultsSection").classList.remove("hidden");
}

// ===== Utility Functions =====

function groupBy(array, key) {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getPRIconForDomain(domain) {
  const icons = {
    Backend: "⚙️",
    Frontend: "🎨",
    DevOps: "🚀",
    Infra: "🏗️",
    Fullstack: "🌐",
    Testing: "✅",
    Docs: "📚",
    Other: "📝",
  };
  return icons[domain] || "📝";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Close modal when clicking outside
document.addEventListener("click", (e) => {
  const modal = document.getElementById("reportModal");
  if (e.target === modal) {
    closeReportModal();
  }
});

// Handle Enter key in search input
document.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && document.getElementById("searchQuery") === document.activeElement) {
    handleFetchAndSummarize();
  }
});
