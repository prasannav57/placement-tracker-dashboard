const state = {
  companies: [],
  editingCompanyId: null,
};

const elements = {
  companyGrid: document.getElementById("companies"),
  companyFeedback: document.getElementById("companyFeedback"),
  companyEmptyState: document.getElementById("companyEmptyState"),
  adminFeedback: document.getElementById("adminFeedback"),
  eligibilityMessage: document.getElementById("eligibilityMessage"),
  eligibilityResults: document.getElementById("eligibilityResults"),
  companyCount: document.getElementById("companyCount"),
  branchCount: document.getElementById("branchCount"),
  eligibilityForm: document.getElementById("eligibilityForm"),
  resetEligibility: document.getElementById("resetEligibility"),
  companyForm: document.getElementById("companyForm"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  companyId: document.getElementById("companyId"),
  companyName: document.getElementById("companyName"),
  companyRole: document.getElementById("companyRole"),
  companyCgpa: document.getElementById("companyCgpa"),
  companyBranch: document.getElementById("companyBranch"),
  companyArrears: document.getElementById("companyArrears"),
  saveCompanyBtn: document.getElementById("saveCompanyBtn"),
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

function companyCriteria(company) {
  return [
    `Role: ${company.role}`,
    `Minimum CGPA: ${company.minCgpa.toFixed(2)}`,
    `Allowed branch: ${company.branch}`,
    `Maximum arrears: ${company.maxArrears}`,
  ];
}

function renderDashboardStats() {
  elements.companyCount.textContent = state.companies.length;
  const branches = new Set(state.companies.map((company) => company.branch));
  elements.branchCount.textContent = branches.size;
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
        <h3>${company.name}</h3>
        <span class="badge success">${company.branch}</span>
      </div>
      <p class="company-meta">
        <strong>${company.role}</strong><br>
        Minimum CGPA: ${company.minCgpa.toFixed(2)}<br>
        Maximum arrears: ${company.maxArrears}
      </p>
      <ul class="criteria-list">
        ${companyCriteria(company).map((item) => `<li>${item}</li>`).join("")}
      </ul>
      <div class="company-actions">
        <button type="button" class="btn btn-edit" data-action="edit" data-id="${company.id}">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete" data-id="${company.id}">Delete</button>
      </div>
    `;

    elements.companyGrid.appendChild(card);
  });
}

function buildEligibilityResults(student) {
  return state.companies.map((company) => {
    const reasons = [];

    if (student.cgpa < company.minCgpa) {
      reasons.push(`CGPA should be at least ${company.minCgpa.toFixed(2)}.`);
    }

    if (student.branch !== company.branch) {
      reasons.push(`Branch must be ${company.branch}.`);
    }

    if (student.arrears > company.maxArrears) {
      reasons.push(`Arrears must be ${company.maxArrears} or fewer.`);
    }

    return {
      company,
      eligible: reasons.length === 0,
      reasons,
    };
  });
}

function renderEligibilityResults(student) {
  const results = buildEligibilityResults(student);
  elements.eligibilityResults.innerHTML = "";

  const eligibleCount = results.filter((item) => item.eligible).length;
  setMessage(
    elements.eligibilityMessage,
    `${student.name} (${student.registerNumber}) matches ${eligibleCount} of ${results.length} companies.`,
    eligibleCount > 0 ? "success" : "error"
  );

  results.forEach(({ company, eligible, reasons }) => {
    const card = document.createElement("article");
    card.className = `result-card ${eligible ? "eligible" : "ineligible"}`;
    card.innerHTML = `
      <div class="card-topline">
        <h4>${company.name}</h4>
        <span class="badge ${eligible ? "success" : "danger"}">
          ${eligible ? "Eligible \u2713" : "Not eligible \u2717"}
        </span>
      </div>
      <p class="company-meta">
        <strong>${student.name}</strong><br>
        Register number: ${student.registerNumber}<br>
        <a href="${student.resumeLink}" target="_blank" rel="noopener noreferrer">View resume</a>
      </p>
      <p class="company-meta"><strong>${company.role}</strong> for ${company.branch}</p>
      ${
        eligible
          ? `<p>You satisfy the current placement criteria for this role.</p>`
          : `<ul class="reason-list">${reasons.map((reason) => `<li>${reason}</li>`).join("")}</ul>`
      }
    `;
    elements.eligibilityResults.appendChild(card);
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
  elements.saveCompanyBtn.textContent = "Update company";
  setMessage(elements.adminFeedback, `Editing ${company.name}. Save when ready.`, "success");
  elements.companyName.focus();
}

function readStudentForm() {
  return {
    name: document.getElementById("studentName").value.trim(),
    registerNumber: document.getElementById("registerNumber").value.trim(),
    resumeLink: document.getElementById("resumeLink").value.trim(),
    cgpa: Number(document.getElementById("cgpa").value),
    branch: document.getElementById("branch").value,
    arrears: Number(document.getElementById("arrears").value),
  };
}

function validateStudent(student) {
  if (!student.name) {
    return "Student name is required.";
  }

  if (!student.registerNumber) {
    return "Register number is required.";
  }

  if (!student.resumeLink) {
    return "Resume link is required.";
  }

  try {
    new URL(student.resumeLink);
  } catch (_error) {
    return "Enter a valid resume URL.";
  }

  if (Number.isNaN(student.cgpa) || student.cgpa < 0 || student.cgpa > 10) {
    return "Enter a CGPA between 0 and 10.";
  }

  if (!student.branch) {
    return "Select a branch before checking eligibility.";
  }

  if (!Number.isInteger(student.arrears) || student.arrears < 0) {
    return "Enter a valid arrear count.";
  }

  return "";
}

function readCompanyForm() {
  return {
    name: elements.companyName.value.trim(),
    role: elements.companyRole.value.trim(),
    minCgpa: Number(elements.companyCgpa.value),
    branch: elements.companyBranch.value,
    maxArrears: Number(elements.companyArrears.value),
  };
}

function validateCompany(company) {
  if (!company.name) {
    return "Company name is required.";
  }

  if (!company.role) {
    return "Role or title is required.";
  }

  if (Number.isNaN(company.minCgpa) || company.minCgpa < 0 || company.minCgpa > 10) {
    return "Minimum CGPA must be between 0 and 10.";
  }

  if (!company.branch) {
    return "Select an allowed branch.";
  }

  if (!Number.isInteger(company.maxArrears) || company.maxArrears < 0) {
    return "Maximum arrears must be a whole number.";
  }

  return "";
}

async function loadCompanies() {
  setMessage(elements.companyFeedback, "Loading company data...");

  try {
    const companies = await apiRequest("/api/companies");
    state.companies = companies;
    renderDashboardStats();
    renderCompanies();
    setMessage(elements.companyFeedback, `Loaded ${companies.length} companies.`, "success");
  } catch (error) {
    state.companies = [];
    renderDashboardStats();
    renderCompanies();
    setMessage(elements.companyFeedback, error.message, "error");
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
  const endpoint = isEditing ? `/api/companies/${state.editingCompanyId}` : "/api/companies";
  const method = isEditing ? "PUT" : "POST";

  try {
    setMessage(elements.adminFeedback, isEditing ? "Updating company..." : "Saving company...");
    await apiRequest(endpoint, {
      method,
      body: JSON.stringify(company),
    });
    await loadCompanies();
    resetCompanyForm();
    setMessage(
      elements.adminFeedback,
      isEditing ? "Company updated successfully." : "Company added successfully.",
      "success"
    );
  } catch (error) {
    setMessage(elements.adminFeedback, error.message, "error");
  }
}

async function deleteCompany(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  const confirmed = window.confirm(`Delete ${company?.name || "this company"}?`);

  if (!confirmed) {
    return;
  }

  try {
    setMessage(elements.companyFeedback, "Deleting company...");
    await apiRequest(`/api/companies/${companyId}`, { method: "DELETE" });
    await loadCompanies();
    if (state.editingCompanyId === companyId) {
      resetCompanyForm();
    }
    setMessage(elements.adminFeedback, "Company deleted successfully.", "success");
  } catch (error) {
    setMessage(elements.companyFeedback, error.message, "error");
  }
}

function handleCompanyGridClick(event) {
  const target = event.target.closest("button[data-action]");
  if (!target) {
    return;
  }

  const { action, id } = target.dataset;
  const company = state.companies.find((item) => item.id === id);

  if (action === "edit" && company) {
    populateCompanyForm(company);
  }

  if (action === "delete") {
    deleteCompany(id);
  }
}

function handleEligibilitySubmit(event) {
  event.preventDefault();
  const student = readStudentForm();
  const validationMessage = validateStudent(student);

  if (validationMessage) {
    elements.eligibilityResults.innerHTML = "";
    setMessage(elements.eligibilityMessage, validationMessage, "error");
    return;
  }

  if (state.companies.length === 0) {
    setMessage(elements.eligibilityMessage, "No companies are available to evaluate right now.", "error");
    return;
  }

  renderEligibilityResults(student);
}

function handleEligibilityReset() {
  elements.eligibilityForm.reset();
  elements.eligibilityResults.innerHTML = "";
  setMessage(elements.eligibilityMessage, "");
}

function registerEventListeners() {
  elements.eligibilityForm.addEventListener("submit", handleEligibilitySubmit);
  elements.resetEligibility.addEventListener("click", handleEligibilityReset);
  elements.companyForm.addEventListener("submit", saveCompany);
  elements.cancelEditBtn.addEventListener("click", resetCompanyForm);
  elements.companyGrid.addEventListener("click", handleCompanyGridClick);
}

registerEventListeners();
loadCompanies();
