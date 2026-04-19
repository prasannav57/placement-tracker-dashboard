const state = {
  companies: [],
  companyPagination: {
    page: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 6,
    branchCoverage: 0,
  },
  companyQuery: "",
  companyBranchFilter: "",
  editingCompanyId: null,
  analytics: null,
  systemMeta: null,
  theme: localStorage.getItem("placement-theme") || "light",
};

const elements = {
  body: document.body,
  companyGrid: document.getElementById("companies"),
  companyFeedback: document.getElementById("companyFeedback"),
  companyEmptyState: document.getElementById("companyEmptyState"),
  companySkeleton: document.getElementById("companySkeleton"),
  adminFeedback: document.getElementById("adminFeedback"),
  eligibilityMessage: document.getElementById("eligibilityMessage"),
  eligibilityResults: document.getElementById("eligibilityResults"),
  eligibilitySkeleton: document.getElementById("eligibilitySkeleton"),
  analyticsFeedback: document.getElementById("analyticsFeedback"),
  analyticsSkeleton: document.getElementById("analyticsSkeleton"),
  resumeFeedback: document.getElementById("resumeFeedback"),
  resumeResults: document.getElementById("resumeResults"),
  resumeSkeleton: document.getElementById("resumeSkeleton"),
  companyCount: document.getElementById("companyCount"),
  checkCount: document.getElementById("checkCount"),
  queueMode: document.getElementById("queueMode"),
  avgPlacementRate: document.getElementById("avgPlacementRate"),
  topCompany: document.getElementById("topCompany"),
  avgSalary: document.getElementById("avgSalary"),
  selectionRatio: document.getElementById("selectionRatio"),
  pageLabel: document.getElementById("pageLabel"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  companySearch: document.getElementById("companySearch"),
  companyFilterBranch: document.getElementById("companyFilterBranch"),
  eligibilityForm: document.getElementById("eligibilityForm"),
  resetEligibility: document.getElementById("resetEligibility"),
  resumeForm: document.getElementById("resumeForm"),
  resetResume: document.getElementById("resetResume"),
  companyForm: document.getElementById("companyForm"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  companyId: document.getElementById("companyId"),
  companyName: document.getElementById("companyName"),
  companyRole: document.getElementById("companyRole"),
  companyCgpa: document.getElementById("companyCgpa"),
  companyBranch: document.getElementById("companyBranch"),
  companyArrears: document.getElementById("companyArrears"),
  companySalary: document.getElementById("companySalary"),
  companySkills: document.getElementById("companySkills"),
  saveCompanyBtn: document.getElementById("saveCompanyBtn"),
  themeToggle: document.getElementById("themeToggle"),
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload?.error
        ? payload.error
        : "Something went wrong while talking to the server.";
    throw new Error(message);
  }

  return payload;
}

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.className = "status-message";
  if (type) {
    element.classList.add(type);
  }
}

function toggleLoading(element, visible) {
  element.hidden = !visible;
}

function debounce(fn, wait = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

function setTheme(theme) {
  state.theme = theme;
  elements.body.classList.toggle("dark-mode", theme === "dark");
  elements.themeToggle.textContent = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  localStorage.setItem("placement-theme", theme);
  if (state.analytics) {
    renderAnalytics(state.analytics);
  }
}

function skillPills(skills = []) {
  return skills.length
    ? `<div class="skill-list">${skills.map((skill) => `<span class="skill-pill">${skill}</span>`).join("")}</div>`
    : `<p class="mini-note">No preferred skills added yet.</p>`;
}

function companyCriteria(company) {
  return [
    `Role: ${company.role}`,
    `Minimum CGPA: ${company.minCgpa.toFixed(2)}`,
    `Allowed branch: ${company.branch}`,
    `Maximum arrears: ${company.maxArrears}`,
    `Salary package: ${company.salaryLpa.toFixed(1)} LPA`,
  ];
}

function renderHeaderStats() {
  elements.companyCount.textContent = state.companyPagination.totalItems;
  elements.checkCount.textContent = state.analytics?.summary.totalChecks ?? 0;
  elements.queueMode.textContent = state.systemMeta?.queueMode || "Local";
}

function renderCompanies() {
  elements.companyGrid.innerHTML = "";
  const hasCompanies = state.companies.length > 0;
  elements.companyEmptyState.hidden = hasCompanies;

  if (!hasCompanies) {
    return;
  }

  state.companies.forEach((company) => {
    const card = document.createElement("article");
    card.className = "company-card";
    card.innerHTML = `
      <div class="card-topline">
        <div>
          <h3>${company.name}</h3>
          <p class="mini-note">${company.role}</p>
        </div>
        <span class="badge success">${company.branch}</span>
      </div>
      <p class="company-meta">
        Salary: ${company.salaryLpa.toFixed(1)} LPA<br>
        Minimum CGPA: ${company.minCgpa.toFixed(2)}<br>
        Maximum arrears: ${company.maxArrears}
      </p>
      <ul class="criteria-list">
        ${companyCriteria(company).map((item) => `<li>${item}</li>`).join("")}
      </ul>
      ${skillPills(company.skills)}
      <div class="company-actions">
        <button type="button" class="btn btn-edit" data-action="edit" data-id="${company.id}">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete" data-id="${company.id}">Delete</button>
      </div>
    `;
    elements.companyGrid.appendChild(card);
  });
}

function renderPagination() {
  const { page, totalPages, totalItems } = state.companyPagination;
  elements.pageLabel.textContent = `Page ${page} of ${Math.max(totalPages, 1)} (${totalItems} companies)`;
  elements.prevPageBtn.disabled = page <= 1;
  elements.nextPageBtn.disabled = page >= totalPages;
}

function canvasThemeStyles() {
  return {
    axis: state.theme === "dark" ? "rgba(148, 163, 184, 0.35)" : "rgba(94, 106, 111, 0.25)",
    text: state.theme === "dark" ? "#eef2f7" : "#1f2a2f",
    hole: state.theme === "dark" ? "#18212b" : "#fffaf1",
  };
}

function setupCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    return null;
  }
  const parentWidth = canvas.parentElement.clientWidth;
  canvas.width = Math.max(320, Math.floor(parentWidth - 24));
  canvas.height = 250;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

function drawBarChart(canvasId, labels, values, suffix = "") {
  const setup = setupCanvas(canvasId);
  if (!setup) {
    return;
  }

  const { canvas, context } = setup;
  const theme = canvasThemeStyles();
  const padding = 32;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const maxValue = Math.max(...values, 1);
  const slotWidth = chartWidth / Math.max(values.length, 1);

  context.strokeStyle = theme.axis;
  context.beginPath();
  context.moveTo(padding, padding);
  context.lineTo(padding, canvas.height - padding);
  context.lineTo(canvas.width - padding, canvas.height - padding);
  context.stroke();

  values.forEach((value, index) => {
    const barWidth = Math.max(24, slotWidth - 18);
    const x = padding + index * slotWidth + (slotWidth - barWidth) / 2;
    const barHeight = maxValue ? (value / maxValue) * (chartHeight - 20) : 0;
    const y = canvas.height - padding - barHeight;

    context.fillStyle = "rgba(15, 118, 110, 0.78)";
    context.fillRect(x, y, barWidth, barHeight);

    context.fillStyle = theme.text;
    context.font = "12px Georgia";
    context.textAlign = "center";
    context.fillText(`${value}${suffix}`, x + barWidth / 2, y - 8);
    context.fillText(labels[index], x + barWidth / 2, canvas.height - padding + 18);
  });
}

function drawLineChart(canvasId, labels, values, suffix = "") {
  const setup = setupCanvas(canvasId);
  if (!setup) {
    return;
  }

  const { canvas, context } = setup;
  const theme = canvasThemeStyles();
  const padding = 32;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const maxValue = Math.max(...values, 1);
  const slotWidth = chartWidth / Math.max(values.length - 1, 1);

  context.strokeStyle = theme.axis;
  context.beginPath();
  context.moveTo(padding, padding);
  context.lineTo(padding, canvas.height - padding);
  context.lineTo(canvas.width - padding, canvas.height - padding);
  context.stroke();

  context.strokeStyle = "rgba(217, 119, 6, 0.88)";
  context.lineWidth = 3;
  context.beginPath();

  values.forEach((value, index) => {
    const x = padding + index * slotWidth;
    const y = canvas.height - padding - (value / maxValue) * (chartHeight - 20);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  values.forEach((value, index) => {
    const x = padding + index * slotWidth;
    const y = canvas.height - padding - (value / maxValue) * (chartHeight - 20);
    context.fillStyle = "rgba(217, 119, 6, 0.88)";
    context.beginPath();
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = theme.text;
    context.font = "12px Georgia";
    context.textAlign = "center";
    context.fillText(`${value}${suffix}`, x, y - 10);
    context.fillText(labels[index], x, canvas.height - padding + 18);
  });
}

function drawDonutChart(canvasId, labels, values) {
  const setup = setupCanvas(canvasId);
  if (!setup) {
    return;
  }

  const { canvas, context } = setup;
  const theme = canvasThemeStyles();
  const total = values.reduce((sum, value) => sum + value, 0);
  const centerX = canvas.width / 2 - 60;
  const centerY = canvas.height / 2;
  const radius = 76;
  const innerRadius = 38;
  const colors = [
    "rgba(15, 118, 110, 0.78)",
    "rgba(217, 119, 6, 0.74)",
    "rgba(96, 165, 250, 0.76)",
    "rgba(248, 113, 113, 0.72)",
  ];

  if (total === 0) {
    context.fillStyle = theme.text;
    context.font = "16px Georgia";
    context.textAlign = "center";
    context.fillText("No analytics data yet", canvas.width / 2, canvas.height / 2);
    return;
  }

  let startAngle = -Math.PI / 2;
  values.forEach((value, index) => {
    const slice = (value / total) * Math.PI * 2;
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, radius, startAngle, startAngle + slice);
    context.closePath();
    context.fillStyle = colors[index % colors.length];
    context.fill();
    startAngle += slice;
  });

  context.beginPath();
  context.fillStyle = theme.hole;
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = theme.text;
  context.font = "bold 18px Georgia";
  context.textAlign = "center";
  context.fillText(`${total}`, centerX, centerY + 6);

  context.textAlign = "left";
  context.font = "12px Georgia";
  labels.forEach((label, index) => {
    const y = 36 + index * 24;
    context.fillStyle = colors[index % colors.length];
    context.fillRect(canvas.width - 165, y - 9, 12, 12);
    context.fillStyle = theme.text;
    context.fillText(`${label} (${values[index]})`, canvas.width - 145, y);
  });
}

function renderAnalytics(analytics) {
  state.analytics = analytics;
  elements.avgPlacementRate.textContent = `${analytics.summary.averagePlacementRate}%`;
  elements.topCompany.textContent = analytics.summary.topCompany || "-";
  elements.avgSalary.textContent = `${analytics.summary.averageSalary} LPA`;
  elements.selectionRatio.textContent = `${analytics.summary.selectedCount} : ${analytics.summary.rejectedCount}`;
  renderHeaderStats();

  drawBarChart(
    "branchChart",
    analytics.branchPlacement.map((item) => item.branch),
    analytics.branchPlacement.map((item) => item.placementRate),
    "%"
  );
  drawDonutChart(
    "companyChart",
    analytics.companyHiring.map((item) => item.company),
    analytics.companyHiring.map((item) => item.eligibleChecks)
  );
  drawLineChart(
    "salaryChart",
    analytics.salaryTrends.map((item) => item.company),
    analytics.salaryTrends.map((item) => item.salaryLpa),
    "L"
  );
  drawBarChart(
    "outcomeChart",
    ["Selected", "Rejected", "Pending"],
    [analytics.summary.selectedCount, analytics.summary.rejectedCount, analytics.summary.pendingCount]
  );
}

function renderEligibilityResults(payload) {
  const { student, results, recommendations } = payload;
  elements.eligibilityResults.innerHTML = "";
  const eligibleCount = results.filter((item) => item.eligible).length;
  setMessage(
    elements.eligibilityMessage,
    `${student.name} (${student.registerNumber}) matches ${eligibleCount} of ${results.length} companies. Status tracked as ${student.placementStatus.toLowerCase()}.`,
    eligibleCount > 0 ? "success" : "error"
  );

  if (recommendations.length) {
    const recommendationBlock = document.createElement("article");
    recommendationBlock.className = "recommendation-card";
    recommendationBlock.innerHTML = `
      <div class="card-topline">
        <div>
          <h4>Best-fit recommendations</h4>
          <p class="mini-note">Top roles suggested by the matching engine.</p>
        </div>
      </div>
      <ul class="criteria-list">
        ${recommendations.slice(0, 5).map((item) => `<li>${item.company.name} - ${item.company.role} (${item.score}% match)</li>`).join("")}
      </ul>
    `;
    elements.eligibilityResults.appendChild(recommendationBlock);
  }

  results.forEach(({ company, eligible, reasons, score, matchedSkills }) => {
    const card = document.createElement("article");
    card.className = `result-card ${eligible ? "eligible" : "ineligible"}`;
    card.innerHTML = `
      <div class="card-topline">
        <div>
          <h4>${company.name}</h4>
          <p class="mini-note">${company.role} for ${company.branch}</p>
        </div>
        <div class="score-ring">${score}%</div>
      </div>
      <p class="company-meta">
        Salary: ${company.salaryLpa.toFixed(1)} LPA<br>
        Resume: <a href="${student.resumeLink}" target="_blank" rel="noopener noreferrer">View</a>
      </p>
      <span class="badge ${eligible ? "success" : "danger"}">${eligible ? "Eligible" : "Not eligible"}</span>
      ${matchedSkills.length ? `<p class="mini-note">Matched skills: ${matchedSkills.join(", ")}</p>` : ""}
      ${eligible ? "<p>You satisfy the current placement criteria for this role.</p>" : `<ul class="reason-list">${reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>`}
    `;
    elements.eligibilityResults.appendChild(card);
  });
}

function renderResumeResults(payload) {
  elements.resumeResults.innerHTML = "";
  setMessage(elements.resumeFeedback, `Generated ${payload.recommendations.length} score-based recommendations. ${payload.processingMode} processing used.`, "success");
  payload.recommendations.forEach((item) => {
    const card = document.createElement("article");
    card.className = "recommendation-card";
    card.innerHTML = `
      <div class="card-topline">
        <div>
          <h4>${item.company.name}</h4>
          <p class="mini-note">${item.company.role} for ${item.company.branch}</p>
        </div>
        <div class="score-ring">${item.score}%</div>
      </div>
      <p class="company-meta">Salary: ${item.company.salaryLpa.toFixed(1)} LPA</p>
      ${skillPills(item.matchedSkills)}
      <ul class="reason-list">${item.reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>
    `;
    elements.resumeResults.appendChild(card);
  });
}

function resetCompanyForm() {
  state.editingCompanyId = null;
  elements.companyForm.reset();
  elements.companyId.value = "";
  elements.saveCompanyBtn.textContent = "Save company";
  setMessage(elements.adminFeedback, "");
}

function populateCompanyForm(company) {
  state.editingCompanyId = company.id;
  elements.companyId.value = company.id;
  elements.companyName.value = company.name;
  elements.companyRole.value = company.role;
  elements.companyCgpa.value = company.minCgpa;
  elements.companyBranch.value = company.branch;
  elements.companyArrears.value = company.maxArrears;
  elements.companySalary.value = company.salaryLpa;
  elements.companySkills.value = (company.skills || []).join(", ");
  elements.saveCompanyBtn.textContent = "Update company";
  setMessage(elements.adminFeedback, `Editing ${company.name}.`, "success");
}

function readStudentForm() {
  return {
    name: document.getElementById("studentName").value.trim(),
    registerNumber: document.getElementById("registerNumber").value.trim(),
    resumeLink: document.getElementById("resumeLink").value.trim(),
    cgpa: Number(document.getElementById("cgpa").value),
    branch: document.getElementById("branch").value,
    arrears: Number(document.getElementById("arrears").value),
    placementStatus: document.getElementById("placementStatus").value,
  };
}

function validateStudent(student) {
  if (!student.name) return "Student name is required.";
  if (!student.registerNumber) return "Register number is required.";
  if (!student.resumeLink) return "Resume link is required.";
  try {
    new URL(student.resumeLink);
  } catch (_error) {
    return "Enter a valid resume URL.";
  }
  if (Number.isNaN(student.cgpa) || student.cgpa < 0 || student.cgpa > 10) return "Enter a CGPA between 0 and 10.";
  if (!student.branch) return "Select a branch.";
  if (!Number.isInteger(student.arrears) || student.arrears < 0) return "Enter a valid arrear count.";
  if (!student.placementStatus) return "Select placement status.";
  return "";
}

function readResumeForm() {
  const cgpaInput = document.getElementById("resumeCgpa").value;
  const arrearsInput = document.getElementById("resumeArrears").value;
  return {
    resumeText: document.getElementById("resumeText").value.trim(),
    branch: document.getElementById("resumeBranch").value,
    cgpa: cgpaInput ? Number(cgpaInput) : null,
    arrears: arrearsInput ? Number(arrearsInput) : null,
  };
}

function validateResumePayload(payload) {
  if (!payload.resumeText || payload.resumeText.length < 20) return "Paste a richer resume summary.";
  if (payload.cgpa !== null && (Number.isNaN(payload.cgpa) || payload.cgpa < 0 || payload.cgpa > 10)) return "Resume CGPA must be between 0 and 10.";
  if (payload.arrears !== null && (!Number.isInteger(payload.arrears) || payload.arrears < 0)) return "Resume arrears must be a whole number.";
  return "";
}

function readCompanyForm() {
  return {
    name: elements.companyName.value.trim(),
    role: elements.companyRole.value.trim(),
    minCgpa: Number(elements.companyCgpa.value),
    branch: elements.companyBranch.value,
    maxArrears: Number(elements.companyArrears.value),
    salaryLpa: Number(elements.companySalary.value),
    skills: elements.companySkills.value.split(",").map((skill) => skill.trim()).filter(Boolean),
  };
}

function validateCompany(company) {
  if (!company.name) return "Company name is required.";
  if (!company.role) return "Role is required.";
  if (Number.isNaN(company.minCgpa) || company.minCgpa < 0 || company.minCgpa > 10) return "Minimum CGPA must be between 0 and 10.";
  if (!company.branch) return "Select a branch.";
  if (!Number.isInteger(company.maxArrears) || company.maxArrears < 0) return "Maximum arrears must be a whole number.";
  if (Number.isNaN(company.salaryLpa) || company.salaryLpa <= 0) return "Salary must be greater than 0.";
  return "";
}

async function loadCompanies(page = state.companyPagination.page) {
  toggleLoading(elements.companySkeleton, true);
  setMessage(elements.companyFeedback, "Loading company data...");
  const params = new URLSearchParams({ page: String(page), limit: String(state.companyPagination.limit) });
  if (state.companyQuery) params.set("q", state.companyQuery);
  if (state.companyBranchFilter) params.set("branch", state.companyBranchFilter);

  try {
    const payload = await apiRequest(`/api/companies?${params.toString()}`);
    state.companies = payload.items;
    state.companyPagination = { ...state.companyPagination, ...payload.pagination };
    renderHeaderStats();
    renderCompanies();
    renderPagination();
    setMessage(elements.companyFeedback, `Showing ${payload.items.length} of ${payload.pagination.totalItems} companies.`, "success");
  } catch (error) {
    state.companies = [];
    renderCompanies();
    renderPagination();
    setMessage(elements.companyFeedback, error.message, "error");
  } finally {
    toggleLoading(elements.companySkeleton, false);
  }
}

async function loadAnalytics() {
  toggleLoading(elements.analyticsSkeleton, true);
  setMessage(elements.analyticsFeedback, "Refreshing analytics...");
  try {
    const analytics = await apiRequest("/api/analytics");
    renderAnalytics(analytics);
    setMessage(elements.analyticsFeedback, "Analytics updated from saved student checks.", "success");
  } catch (error) {
    setMessage(elements.analyticsFeedback, error.message, "error");
  } finally {
    toggleLoading(elements.analyticsSkeleton, false);
  }
}

async function loadSystemMeta() {
  try {
    state.systemMeta = await apiRequest("/api/system/meta");
    renderHeaderStats();
  } catch (_error) {
    state.systemMeta = { queueMode: "Local" };
    renderHeaderStats();
  }
}

async function saveCompany(event) {
  event.preventDefault();
  const company = readCompanyForm();
  const validationMessage = validateCompany(company);
  if (validationMessage) {
    setMessage(elements.adminFeedback, validationMessage, "error");
    return;
  }
  const isEditing = Boolean(state.editingCompanyId);
  try {
    setMessage(elements.adminFeedback, isEditing ? "Updating company..." : "Saving company...");
    await apiRequest(isEditing ? `/api/companies/${state.editingCompanyId}` : "/api/companies", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify(company),
    });
    await Promise.all([loadCompanies(1), loadAnalytics()]);
    resetCompanyForm();
    setMessage(elements.adminFeedback, isEditing ? "Company updated successfully." : "Company added successfully.", "success");
  } catch (error) {
    setMessage(elements.adminFeedback, error.message, "error");
  }
}

async function deleteCompany(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  if (!window.confirm(`Delete ${company?.name || "this company"}?`)) {
    return;
  }
  try {
    setMessage(elements.companyFeedback, "Deleting company...");
    await apiRequest(`/api/companies/${companyId}`, { method: "DELETE" });
    if (state.editingCompanyId === companyId) resetCompanyForm();
    await Promise.all([loadCompanies(1), loadAnalytics()]);
    setMessage(elements.adminFeedback, "Company deleted successfully.", "success");
  } catch (error) {
    setMessage(elements.companyFeedback, error.message, "error");
  }
}

function handleCompanyGridClick(event) {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const company = state.companies.find((item) => item.id === target.dataset.id);
  if (target.dataset.action === "edit" && company) populateCompanyForm(company);
  if (target.dataset.action === "delete") deleteCompany(target.dataset.id);
}

async function handleEligibilitySubmit(event) {
  event.preventDefault();
  const student = readStudentForm();
  const validationMessage = validateStudent(student);
  if (validationMessage) {
    elements.eligibilityResults.innerHTML = "";
    setMessage(elements.eligibilityMessage, validationMessage, "error");
    return;
  }
  toggleLoading(elements.eligibilitySkeleton, true);
  try {
    setMessage(elements.eligibilityMessage, "Evaluating eligibility...");
    const payload = await apiRequest("/api/eligibility/check", {
      method: "POST",
      body: JSON.stringify(student),
    });
    renderEligibilityResults(payload);
    await loadAnalytics();
  } catch (error) {
    elements.eligibilityResults.innerHTML = "";
    setMessage(elements.eligibilityMessage, error.message, "error");
  } finally {
    toggleLoading(elements.eligibilitySkeleton, false);
  }
}

function handleEligibilityReset() {
  elements.eligibilityForm.reset();
  elements.eligibilityResults.innerHTML = "";
  setMessage(elements.eligibilityMessage, "");
}

async function handleResumeSubmit(event) {
  event.preventDefault();
  const payload = readResumeForm();
  const validationMessage = validateResumePayload(payload);
  if (validationMessage) {
    elements.resumeResults.innerHTML = "";
    setMessage(elements.resumeFeedback, validationMessage, "error");
    return;
  }
  toggleLoading(elements.resumeSkeleton, true);
  try {
    setMessage(elements.resumeFeedback, "Analyzing resume...");
    const response = await apiRequest("/api/resume/match", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderResumeResults(response);
    await loadAnalytics();
  } catch (error) {
    elements.resumeResults.innerHTML = "";
    setMessage(elements.resumeFeedback, error.message, "error");
  } finally {
    toggleLoading(elements.resumeSkeleton, false);
  }
}

function handleResumeReset() {
  elements.resumeForm.reset();
  elements.resumeResults.innerHTML = "";
  setMessage(elements.resumeFeedback, "");
}

function registerEventListeners() {
  elements.themeToggle.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
  elements.eligibilityForm.addEventListener("submit", handleEligibilitySubmit);
  elements.resetEligibility.addEventListener("click", handleEligibilityReset);
  elements.resumeForm.addEventListener("submit", handleResumeSubmit);
  elements.resetResume.addEventListener("click", handleResumeReset);
  elements.companyForm.addEventListener("submit", saveCompany);
  elements.cancelEditBtn.addEventListener("click", resetCompanyForm);
  elements.companyGrid.addEventListener("click", handleCompanyGridClick);
  elements.prevPageBtn.addEventListener("click", () => loadCompanies(state.companyPagination.page - 1));
  elements.nextPageBtn.addEventListener("click", () => loadCompanies(state.companyPagination.page + 1));
  elements.companySearch.addEventListener("input", debounce((event) => {
    state.companyQuery = event.target.value.trim();
    loadCompanies(1);
  }));
  elements.companyFilterBranch.addEventListener("change", (event) => {
    state.companyBranchFilter = event.target.value;
    loadCompanies(1);
  });
  window.addEventListener("resize", debounce(() => {
    if (state.analytics) {
      renderAnalytics(state.analytics);
    }
  }, 150));
}

setTheme(state.theme);
registerEventListeners();
Promise.all([loadSystemMeta(), loadCompanies(1), loadAnalytics()]);
