const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDirectory = path.join(__dirname, "data");
const companiesFile = path.join(dataDirectory, "companies.json");
const checksFile = path.join(dataDirectory, "studentChecks.json");
const cache = new Map();
const CACHE_TTL_MS = 30000;

app.use(express.json());
app.use(express.static(__dirname));

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() > cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCache(key, value, ttl = CACHE_TTL_MS) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

function invalidateCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

function normalizeSkills(skillsInput, role = "", name = "") {
  if (Array.isArray(skillsInput)) {
    return [...new Set(skillsInput.map((skill) => String(skill).trim()).filter(Boolean))];
  }

  if (typeof skillsInput === "string" && skillsInput.trim()) {
    return [...new Set(skillsInput.split(",").map((skill) => skill.trim()).filter(Boolean))];
  }

  return [...new Set(`${role} ${name}`.split(/\s+/).filter((token) => token.length > 2))];
}

async function ensureDataFiles() {
  await fs.mkdir(dataDirectory, { recursive: true });

  try {
    await fs.access(companiesFile);
  } catch {
    const seedCompanies = [
      {
        id: "cmp_tcs",
        name: "TCS",
        role: "Developer",
        minCgpa: 7,
        branch: "CSE",
        maxArrears: 0,
        skills: ["Java", "SQL", "Problem Solving"],
      },
      {
        id: "cmp_infosys",
        name: "Infosys",
        role: "Systems Engineer",
        minCgpa: 6,
        branch: "IT",
        maxArrears: 1,
        skills: ["JavaScript", "Communication", "SQL"],
      },
      {
        id: "cmp_wipro",
        name: "Wipro",
        role: "Project Engineer",
        minCgpa: 6.5,
        branch: "CSE",
        maxArrears: 0,
        skills: ["Node.js", "APIs", "Debugging"],
      },
    ];
    await fs.writeFile(companiesFile, JSON.stringify(seedCompanies, null, 2));
  }

  try {
    await fs.access(checksFile);
  } catch {
    await fs.writeFile(checksFile, JSON.stringify([], null, 2));
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function readCompanies() {
  await ensureDataFiles();
  const companies = await readJson(companiesFile, []);
  return companies.map((company) => ({
    ...company,
    skills: normalizeSkills(company.skills, company.role, company.name),
  }));
}

async function readChecks() {
  await ensureDataFiles();
  return readJson(checksFile, []);
}

function validateCompanyPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "Company payload is required.";
  }

  const { name, role, minCgpa, branch, maxArrears } = payload;

  if (!name || typeof name !== "string") {
    return "Company name is required.";
  }
  if (!role || typeof role !== "string") {
    return "Role is required.";
  }
  if (typeof minCgpa !== "number" || Number.isNaN(minCgpa) || minCgpa < 0 || minCgpa > 10) {
    return "Minimum CGPA must be a number between 0 and 10.";
  }
  if (!branch || typeof branch !== "string") {
    return "Branch is required.";
  }
  if (!Number.isInteger(maxArrears) || maxArrears < 0) {
    return "Maximum arrears must be a whole number.";
  }

  return "";
}

function normalizeCompany(payload, existingId) {
  return {
    id: existingId || `cmp_${Date.now()}`,
    name: payload.name.trim(),
    role: payload.role.trim(),
    minCgpa: Number(payload.minCgpa),
    branch: payload.branch.trim().toUpperCase(),
    maxArrears: Number(payload.maxArrears),
    skills: normalizeSkills(payload.skills, payload.role, payload.name),
  };
}

function validateStudentPayload(payload) {
  if (!payload.name || typeof payload.name !== "string") {
    return "Student name is required.";
  }
  if (!payload.registerNumber || typeof payload.registerNumber !== "string") {
    return "Register number is required.";
  }
  if (!payload.resumeLink || typeof payload.resumeLink !== "string") {
    return "Resume link is required.";
  }
  if (typeof payload.cgpa !== "number" || Number.isNaN(payload.cgpa) || payload.cgpa < 0 || payload.cgpa > 10) {
    return "CGPA must be between 0 and 10.";
  }
  if (!payload.branch || typeof payload.branch !== "string") {
    return "Branch is required.";
  }
  if (!Number.isInteger(payload.arrears) || payload.arrears < 0) {
    return "Arrears must be a whole number.";
  }
  return "";
}

function extractResumeKeywords(text) {
  const normalized = String(text || "").toLowerCase();
  const keywords = normalized
    .replace(/[^a-z0-9+.#\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);

  return [...new Set(keywords)];
}

function scoreCompanyMatch(company, context) {
  const reasons = [];
  const matchedSkills = [];
  const resumeKeywords = extractResumeKeywords(context.resumeText || "");
  const resumeSet = new Set(resumeKeywords);
  let score = 35;
  let eligible = true;

  if (typeof context.cgpa === "number") {
    if (context.cgpa >= company.minCgpa) {
      score += 20;
      reasons.push(`Meets CGPA requirement of ${company.minCgpa.toFixed(2)}.`);
    } else {
      score -= 18;
      eligible = false;
      reasons.push(`Needs at least ${company.minCgpa.toFixed(2)} CGPA.`);
    }
  }

  if (context.branch) {
    if (context.branch.toUpperCase() === company.branch) {
      score += 18;
      reasons.push(`Matches preferred branch ${company.branch}.`);
    } else {
      score -= 12;
      eligible = false;
      reasons.push(`Preferred branch is ${company.branch}.`);
    }
  }

  if (Number.isInteger(context.arrears)) {
    if (context.arrears <= company.maxArrears) {
      score += 10;
      reasons.push(`Within arrears limit (${company.maxArrears}).`);
    } else {
      score -= 12;
      eligible = false;
      reasons.push(`Arrears should be ${company.maxArrears} or fewer.`);
    }
  }

  for (const skill of company.skills) {
    const normalizedSkill = skill.toLowerCase();
    if (resumeSet.has(normalizedSkill) || resumeKeywords.some((token) => normalizedSkill.includes(token) || token.includes(normalizedSkill))) {
      matchedSkills.push(skill);
    }
  }

  if (matchedSkills.length > 0) {
    score += Math.min(25, matchedSkills.length * 8);
    reasons.push(`Resume aligns with ${matchedSkills.length} preferred skills.`);
  } else if (company.skills.length > 0) {
    reasons.push("Add more role-relevant skills in the resume summary for a stronger match.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    company,
    eligible,
    score,
    reasons,
    matchedSkills,
  };
}

async function buildAnalytics() {
  const cacheKey = "analytics:summary";
  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const [companies, checks] = await Promise.all([readCompanies(), readChecks()]);
  const branchMap = new Map();
  const companyMap = new Map(companies.map((company) => [company.id, { company: company.name, eligibleChecks: 0 }]));
  let totalRecommendations = 0;

  for (const check of checks) {
    const branch = (check.student?.branch || "UNKNOWN").toUpperCase();
    const branchEntry = branchMap.get(branch) || { branch, totalChecks: 0, successfulChecks: 0 };
    branchEntry.totalChecks += 1;

    const successful = (check.results || []).some((result) => result.eligible);
    if (successful) {
      branchEntry.successfulChecks += 1;
    }

    branchMap.set(branch, branchEntry);

    for (const result of check.results || []) {
      if (result.eligible && companyMap.has(result.company.id)) {
        companyMap.get(result.company.id).eligibleChecks += 1;
      }
    }

    totalRecommendations += (check.recommendations || []).length;
  }

  const branchPlacement = Array.from(branchMap.values())
    .map((item) => ({
      ...item,
      placementRate: item.totalChecks ? Number(((item.successfulChecks / item.totalChecks) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => a.branch.localeCompare(b.branch));

  const companyHiring = Array.from(companyMap.values())
    .sort((a, b) => b.eligibleChecks - a.eligibleChecks || a.company.localeCompare(b.company))
    .slice(0, 6);

  const averagePlacementRate = branchPlacement.length
    ? Number(
        (
          branchPlacement.reduce((sum, item) => sum + item.placementRate, 0) / branchPlacement.length
        ).toFixed(1)
      )
    : 0;

  const topCompany = companyHiring.find((item) => item.eligibleChecks > 0)?.company || "No data yet";

  const analytics = {
    branchPlacement: branchPlacement.length
      ? branchPlacement
      : companies.reduce((list, company) => {
          if (!list.some((item) => item.branch === company.branch)) {
            list.push({
              branch: company.branch,
              totalChecks: 0,
              successfulChecks: 0,
              placementRate: 0,
            });
          }
          return list;
        }, []),
    companyHiring,
    summary: {
      totalChecks: checks.length,
      totalRecommendations,
      averagePlacementRate,
      topCompany,
    },
  };

  setCache(cacheKey, analytics);
  return analytics;
}

app.get("/api/companies", async (req, res) => {
  const cacheKey = `companies:${JSON.stringify(req.query)}`;
  const cached = getCache(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    const companies = await readCompanies();
    const query = String(req.query.q || "").trim().toLowerCase();
    const branch = String(req.query.branch || "").trim().toUpperCase();
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(12, Number.parseInt(req.query.limit, 10) || 6));

    const filtered = companies.filter((company) => {
      const matchesQuery =
        !query ||
        company.name.toLowerCase().includes(query) ||
        company.role.toLowerCase().includes(query) ||
        company.skills.some((skill) => skill.toLowerCase().includes(query));
      const matchesBranch = !branch || company.branch === branch;
      return matchesQuery && matchesBranch;
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    const payload = {
      items,
      pagination: {
        page: safePage,
        totalPages,
        totalItems,
        limit,
        branchCoverage: new Set(companies.map((company) => company.branch)).size,
      },
    };

    setCache(cacheKey, payload);
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Unable to load company data." });
  }
});

app.get("/api/analytics", async (_req, res) => {
  try {
    const analytics = await buildAnalytics();
    res.json(analytics);
  } catch {
    res.status(500).json({ error: "Unable to load analytics right now." });
  }
});

app.post("/api/companies", async (req, res) => {
  const validationError = validateCompanyPayload(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const companies = await readCompanies();
    const newCompany = normalizeCompany(req.body);
    companies.push(newCompany);
    await writeJson(companiesFile, companies);
    invalidateCache("companies:");
    invalidateCache("analytics:");
    res.status(201).json(newCompany);
  } catch {
    res.status(500).json({ error: "Unable to save the company." });
  }
});

app.put("/api/companies/:id", async (req, res) => {
  const validationError = validateCompanyPayload(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const companies = await readCompanies();
    const companyIndex = companies.findIndex((company) => company.id === req.params.id);

    if (companyIndex === -1) {
      res.status(404).json({ error: "Company not found." });
      return;
    }

    const updatedCompany = normalizeCompany(req.body, req.params.id);
    companies[companyIndex] = updatedCompany;
    await writeJson(companiesFile, companies);
    invalidateCache("companies:");
    invalidateCache("analytics:");
    res.json(updatedCompany);
  } catch {
    res.status(500).json({ error: "Unable to update the company." });
  }
});

app.delete("/api/companies/:id", async (req, res) => {
  try {
    const companies = await readCompanies();
    const companyIndex = companies.findIndex((company) => company.id === req.params.id);

    if (companyIndex === -1) {
      res.status(404).json({ error: "Company not found." });
      return;
    }

    companies.splice(companyIndex, 1);
    await writeJson(companiesFile, companies);
    invalidateCache("companies:");
    invalidateCache("analytics:");
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Unable to delete the company." });
  }
});

app.post("/api/eligibility/check", async (req, res) => {
  const validationError = validateStudentPayload(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  try {
    const companies = await readCompanies();
    const student = {
      name: req.body.name.trim(),
      registerNumber: req.body.registerNumber.trim(),
      resumeLink: req.body.resumeLink.trim(),
      cgpa: Number(req.body.cgpa),
      branch: req.body.branch.trim().toUpperCase(),
      arrears: Number(req.body.arrears),
    };

    const results = companies
      .map((company) => scoreCompanyMatch(company, student))
      .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name));

    const recommendations = results
      .filter((item) => item.score >= 45)
      .slice(0, 5);

    const checks = await readChecks();
    checks.push({
      id: `check_${Date.now()}`,
      createdAt: new Date().toISOString(),
      student,
      results,
      recommendations,
    });
    await writeJson(checksFile, checks);
    invalidateCache("analytics:");

    res.json({ student, results, recommendations });
  } catch {
    res.status(500).json({ error: "Unable to evaluate eligibility right now." });
  }
});

app.post("/api/resume/match", async (req, res) => {
  const resumeText = String(req.body.resumeText || "").trim();
  if (resumeText.length < 20) {
    res.status(400).json({ error: "Provide a richer resume summary or skill list for matching." });
    return;
  }

  try {
    const companies = await readCompanies();
    const context = {
      resumeText,
      branch: req.body.branch ? String(req.body.branch).trim().toUpperCase() : "",
      cgpa: typeof req.body.cgpa === "number" ? req.body.cgpa : null,
      arrears: Number.isInteger(req.body.arrears) ? req.body.arrears : null,
    };

    const recommendations = companies
      .map((company) => scoreCompanyMatch(company, context))
      .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
      .slice(0, 5);

    const checks = await readChecks();
    checks.push({
      id: `resume_${Date.now()}`,
      createdAt: new Date().toISOString(),
      student: {
        name: "Resume Analyzer",
        registerNumber: "AI-MATCH",
        resumeLink: "N/A",
        branch: context.branch || "GENERAL",
        cgpa: typeof context.cgpa === "number" ? context.cgpa : 0,
        arrears: Number.isInteger(context.arrears) ? context.arrears : 0,
      },
      results: recommendations,
      recommendations,
    });
    await writeJson(checksFile, checks);
    invalidateCache("analytics:");

    res.json({
      recommendations,
    });
  } catch {
    res.status(500).json({ error: "Unable to run resume matching right now." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

ensureDataFiles()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Placement tracker running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    console.error("Failed to initialize company data.");
    process.exit(1);
  });
