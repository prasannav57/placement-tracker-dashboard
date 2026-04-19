const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const rateLimit = require("express-rate-limit");
const IORedis = require("ioredis");
const { Queue, Worker, QueueEvents } = require("bullmq");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDirectory = path.join(__dirname, "data");
const companiesFile = path.join(dataDirectory, "companies.json");
const checksFile = path.join(dataDirectory, "studentChecks.json");
const CACHE_TTL_SECONDS = 30;
const memoryCache = new Map();

let redis = null;
let resumeQueue = null;
let resumeWorker = null;
let resumeQueueEvents = null;
let queueMode = "Local";

app.use(express.json());
app.use(express.static(__dirname));
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a minute and try again." },
  })
);

function sanitizeCompanyName(name) {
  return String(name || "").trim();
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

function getMemoryCache(key) {
  const entry = memoryCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryCache(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

async function getCachedValue(key) {
  if (redis) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  return getMemoryCache(key);
}

async function setCachedValue(key, value, ttlSeconds = CACHE_TTL_SECONDS) {
  if (redis) {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return;
  }
  setMemoryCache(key, value, ttlSeconds);
}

async function invalidateCache(prefix) {
  if (redis) {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) {
      await redis.del(keys);
    }
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
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
        salaryLpa: 4.2,
        skills: ["Java", "SQL", "Problem Solving"],
      },
      {
        id: "cmp_infosys",
        name: "Infosys",
        role: "Systems Engineer",
        minCgpa: 7.5,
        branch: "IT",
        maxArrears: 0,
        salaryLpa: 5.0,
        skills: ["JavaScript", "Communication", "SQL"],
      },
      {
        id: "cmp_wipro",
        name: "Wipro",
        role: "Project Engineer",
        minCgpa: 6.5,
        branch: "CSE",
        maxArrears: 0,
        salaryLpa: 4.8,
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
    name: sanitizeCompanyName(company.name),
    skills: normalizeSkills(company.skills, company.role, company.name),
    salaryLpa: Number(company.salaryLpa || 0),
  }));
}

async function readChecks() {
  await ensureDataFiles();
  return readJson(checksFile, []);
}

function validateCompanyPayload(payload) {
  if (!payload || typeof payload !== "object") return "Company payload is required.";
  if (!payload.name || typeof payload.name !== "string") return "Company name is required.";
  if (!payload.role || typeof payload.role !== "string") return "Role is required.";
  if (typeof payload.minCgpa !== "number" || Number.isNaN(payload.minCgpa) || payload.minCgpa < 0 || payload.minCgpa > 10) return "Minimum CGPA must be between 0 and 10.";
  if (!payload.branch || typeof payload.branch !== "string") return "Branch is required.";
  if (!Number.isInteger(payload.maxArrears) || payload.maxArrears < 0) return "Maximum arrears must be a whole number.";
  if (typeof payload.salaryLpa !== "number" || Number.isNaN(payload.salaryLpa) || payload.salaryLpa <= 0) return "Salary must be greater than 0.";
  return "";
}

function normalizeCompany(payload, existingId) {
  return {
    id: existingId || `cmp_${Date.now()}`,
    name: sanitizeCompanyName(payload.name),
    role: payload.role.trim(),
    minCgpa: Number(payload.minCgpa),
    branch: payload.branch.trim().toUpperCase(),
    maxArrears: Number(payload.maxArrears),
    salaryLpa: Number(payload.salaryLpa),
    skills: normalizeSkills(payload.skills, payload.role, payload.name),
  };
}

function validateStudentPayload(payload) {
  if (!payload.name || typeof payload.name !== "string") return "Student name is required.";
  if (!payload.registerNumber || typeof payload.registerNumber !== "string") return "Register number is required.";
  if (!payload.resumeLink || typeof payload.resumeLink !== "string") return "Resume link is required.";
  if (typeof payload.cgpa !== "number" || Number.isNaN(payload.cgpa) || payload.cgpa < 0 || payload.cgpa > 10) return "CGPA must be between 0 and 10.";
  if (!payload.branch || typeof payload.branch !== "string") return "Branch is required.";
  if (!Number.isInteger(payload.arrears) || payload.arrears < 0) return "Arrears must be a whole number.";
  if (!payload.placementStatus || typeof payload.placementStatus !== "string") return "Placement status is required.";
  return "";
}

function extractResumeKeywords(text) {
  return [...new Set(String(text || "").toLowerCase().replace(/[^a-z0-9+.#\s]/g, " ").split(/\s+/).filter((token) => token.length > 1))];
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
  } else if (company.skills.length) {
    reasons.push("Add more role-relevant skills in the resume summary for a stronger match.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { company, eligible, score, reasons, matchedSkills };
}

async function buildAnalytics() {
  const cacheKey = "analytics:summary";
  const cached = await getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const [companies, checks] = await Promise.all([readCompanies(), readChecks()]);
  const branchMap = new Map();
  const companyMap = new Map(companies.map((company) => [company.id, { company: company.name, eligibleChecks: 0 }]));
  let totalRecommendations = 0;
  let selectedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;

  for (const check of checks) {
    const branch = (check.student?.branch || "UNKNOWN").toUpperCase();
    const status = (check.student?.placementStatus || "PENDING").toUpperCase();
    const branchEntry = branchMap.get(branch) || { branch, totalChecks: 0, successfulChecks: 0 };
    branchEntry.totalChecks += 1;
    if ((check.results || []).some((result) => result.eligible)) {
      branchEntry.successfulChecks += 1;
    }
    branchMap.set(branch, branchEntry);

    if (status === "SELECTED") selectedCount += 1;
    else if (status === "REJECTED") rejectedCount += 1;
    else pendingCount += 1;

    for (const result of check.results || []) {
      if (result.eligible && companyMap.has(result.company.id)) {
        companyMap.get(result.company.id).eligibleChecks += 1;
      }
    }
    totalRecommendations += (check.recommendations || []).length;
  }

  const branchPlacement = Array.from(branchMap.values()).map((item) => ({
    ...item,
    placementRate: item.totalChecks ? Number(((item.successfulChecks / item.totalChecks) * 100).toFixed(1)) : 0,
  }));
  const companyHiring = Array.from(companyMap.values()).sort((a, b) => b.eligibleChecks - a.eligibleChecks || a.company.localeCompare(b.company)).slice(0, 6);
  const salaryTrends = companies.map((company) => ({ company: company.name, salaryLpa: Number(company.salaryLpa.toFixed(1)) })).sort((a, b) => b.salaryLpa - a.salaryLpa).slice(0, 6);

  const analytics = {
    branchPlacement,
    companyHiring,
    salaryTrends,
    summary: {
      totalChecks: checks.length,
      totalRecommendations,
      averagePlacementRate: branchPlacement.length ? Number((branchPlacement.reduce((sum, item) => sum + item.placementRate, 0) / branchPlacement.length).toFixed(1)) : 0,
      topCompany: companyHiring.find((item) => item.eligibleChecks > 0)?.company || "No data yet",
      averageSalary: companies.length ? Number((companies.reduce((sum, item) => sum + item.salaryLpa, 0) / companies.length).toFixed(1)) : 0,
      selectedCount,
      rejectedCount,
      pendingCount,
    },
  };

  await setCachedValue(cacheKey, analytics);
  return analytics;
}

async function analyzeResume(payload) {
  const companies = await readCompanies();
  const context = {
    resumeText: payload.resumeText,
    branch: payload.branch ? String(payload.branch).trim().toUpperCase() : "",
    cgpa: typeof payload.cgpa === "number" ? payload.cgpa : null,
    arrears: Number.isInteger(payload.arrears) ? payload.arrears : null,
  };
  return companies
    .map((company) => scoreCompanyMatch(company, context))
    .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name))
    .slice(0, 5);
}

async function appendCheck(entry) {
  const checks = await readChecks();
  checks.push(entry);
  await writeJson(checksFile, checks);
  await invalidateCache("analytics:");
}

app.get("/api/system/meta", (_req, res) => {
  res.json({
    queueMode,
    cacheMode: redis ? "Redis" : "Memory",
  });
});

app.get("/api/companies", async (req, res) => {
  const cacheKey = `companies:${JSON.stringify(req.query)}`;
  const cached = await getCachedValue(cacheKey);
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
      const matchesQuery = !query || company.name.toLowerCase().includes(query) || company.role.toLowerCase().includes(query) || company.skills.some((skill) => skill.toLowerCase().includes(query));
      const matchesBranch = !branch || company.branch === branch;
      return matchesQuery && matchesBranch;
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const items = filtered.slice((safePage - 1) * limit, (safePage - 1) * limit + limit);
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
    await setCachedValue(cacheKey, payload);
    res.json(payload);
  } catch {
    res.status(500).json({ error: "Unable to load company data." });
  }
});

app.get("/api/analytics", async (_req, res) => {
  try {
    res.json(await buildAnalytics());
  } catch {
    res.status(500).json({ error: "Unable to load analytics right now." });
  }
});

app.post("/api/companies", async (req, res) => {
  const error = validateCompanyPayload(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  try {
    const companies = await readCompanies();
    const company = normalizeCompany(req.body);
    companies.push(company);
    await writeJson(companiesFile, companies);
    await invalidateCache("companies:");
    await invalidateCache("analytics:");
    res.status(201).json(company);
  } catch {
    res.status(500).json({ error: "Unable to save the company." });
  }
});

app.put("/api/companies/:id", async (req, res) => {
  const error = validateCompanyPayload(req.body);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  try {
    const companies = await readCompanies();
    const index = companies.findIndex((company) => company.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Company not found." });
      return;
    }
    const company = normalizeCompany(req.body, req.params.id);
    companies[index] = company;
    await writeJson(companiesFile, companies);
    await invalidateCache("companies:");
    await invalidateCache("analytics:");
    res.json(company);
  } catch {
    res.status(500).json({ error: "Unable to update the company." });
  }
});

app.delete("/api/companies/:id", async (req, res) => {
  try {
    const companies = await readCompanies();
    const index = companies.findIndex((company) => company.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Company not found." });
      return;
    }
    companies.splice(index, 1);
    await writeJson(companiesFile, companies);
    await invalidateCache("companies:");
    await invalidateCache("analytics:");
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Unable to delete the company." });
  }
});

app.post("/api/eligibility/check", async (req, res) => {
  const error = validateStudentPayload(req.body);
  if (error) {
    res.status(400).json({ error });
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
      placementStatus: req.body.placementStatus.trim().toUpperCase(),
    };
    const results = companies.map((company) => scoreCompanyMatch(company, student)).sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name));
    const recommendations = results.filter((item) => item.score >= 45).slice(0, 5);
    await appendCheck({
      id: `check_${Date.now()}`,
      createdAt: new Date().toISOString(),
      student,
      results,
      recommendations,
    });
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
    let recommendations;
    let processingMode = "Local";

    if (resumeQueue && resumeQueueEvents) {
      processingMode = "BullMQ";
      const job = await resumeQueue.add("resume-analysis", req.body);
      recommendations = await job.waitUntilFinished(resumeQueueEvents, 10000);
    } else {
      recommendations = await analyzeResume(req.body);
    }

    await appendCheck({
      id: `resume_${Date.now()}`,
      createdAt: new Date().toISOString(),
      student: {
        name: "Resume Analyzer",
        registerNumber: "AI-MATCH",
        resumeLink: "N/A",
        branch: req.body.branch ? String(req.body.branch).trim().toUpperCase() : "GENERAL",
        cgpa: typeof req.body.cgpa === "number" ? req.body.cgpa : 0,
        arrears: Number.isInteger(req.body.arrears) ? req.body.arrears : 0,
        placementStatus: "PENDING",
      },
      results: recommendations,
      recommendations,
    });

    res.json({ recommendations, processingMode });
  } catch {
    res.status(500).json({ error: "Unable to run resume matching right now." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function setupOptionalInfrastructure() {
  if (!process.env.REDIS_URL) {
    queueMode = "Local";
    return;
  }
  try {
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    resumeQueue = new Queue("resume-analysis", { connection: redis });
    resumeQueueEvents = new QueueEvents("resume-analysis", { connection: redis });
    resumeWorker = new Worker(
      "resume-analysis",
      async (job) => analyzeResume(job.data),
      { connection: redis }
    );
    queueMode = "BullMQ";
  } catch {
    redis = null;
    resumeQueue = null;
    resumeWorker = null;
    resumeQueueEvents = null;
    queueMode = "Local";
  }
}

ensureDataFiles()
  .then(setupOptionalInfrastructure)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Placement tracker running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    console.error("Failed to initialize company data.");
    process.exit(1);
  });
