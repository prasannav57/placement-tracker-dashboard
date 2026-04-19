const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dataDirectory = path.join(__dirname, "data");
const dataFile = path.join(dataDirectory, "companies.json");

app.use(express.json());
app.use(express.static(__dirname));

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.mkdir(dataDirectory, { recursive: true });
    const seedCompanies = [
      {
        id: "cmp_tcs",
        name: "TCS",
        role: "Developer",
        minCgpa: 7,
        branch: "CSE",
        maxArrears: 0,
      },
      {
        id: "cmp_infosys",
        name: "Infosys",
        role: "Systems Engineer",
        minCgpa: 6,
        branch: "IT",
        maxArrears: 1,
      },
      {
        id: "cmp_wipro",
        name: "Wipro",
        role: "Project Engineer",
        minCgpa: 6.5,
        branch: "CSE",
        maxArrears: 0,
      },
    ];
    await fs.writeFile(dataFile, JSON.stringify(seedCompanies, null, 2));
  }
}

async function readCompanies() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeCompanies(companies) {
  await fs.writeFile(dataFile, JSON.stringify(companies, null, 2));
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
  };
}

app.get("/api/companies", async (_req, res) => {
  try {
    const companies = await readCompanies();
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: "Unable to load company data." });
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
    await writeCompanies(companies);
    res.status(201).json(newCompany);
  } catch (error) {
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
    await writeCompanies(companies);
    res.json(updatedCompany);
  } catch (error) {
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
    await writeCompanies(companies);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Unable to delete the company." });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

ensureDataFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Placement tracker running on http://localhost:${PORT}`);
    });
  })
  .catch(() => {
    console.error("Failed to initialize company data.");
    process.exit(1);
  });
