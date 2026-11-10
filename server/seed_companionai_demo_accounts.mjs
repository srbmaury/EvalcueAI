#!/usr/bin/env node
// Seeds fixtures in a new, dedicated local database. Run from server/.
// Supply MONGO_URI and DEMO_PASSWORD through the environment.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import dotenv from "dotenv";
dotenv.config();

const serverDir = process.cwd();
const localUri = /^mongodb:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/evalcue_demo_[a-z0-9_]+(?:\?.*)?$/i;
if (process.env.NODE_ENV === "production" || !localUri.test(process.env.MONGO_URI || "")) {
  throw new Error("Use a dedicated local MongoDB database named evalcue_demo_<name>");
}
if (!process.env.DEMO_PASSWORD || process.env.DEMO_PASSWORD.length < 12 || Buffer.byteLength(process.env.DEMO_PASSWORD, "utf8") > 72) {
  throw new Error("DEMO_PASSWORD must be at least 12 characters and at most 72 UTF-8 bytes");
}

const req = createRequire(path.join(serverDir, "package.json"));
const mongoose = req("mongoose");

const importFromServer = async (relativePath) =>
  import(pathToFileURL(path.join(serverDir, relativePath)).href);

const { default: User } = await importFromServer("src/models/User.js");
const { default: Organization } = await importFromServer("src/models/Organization.js");
const { default: OrganizationMembership } = await importFromServer("src/models/OrganizationMembership.js");

const users = [
  ...Array.from({ length: 10 }, (_, i) => ({
    email: `candidate${String(i + 1).padStart(2, "0")}@srbmaury.com`,
    name: `Demo Candidate ${String(i + 1).padStart(2, "0")}`,
    role: "user",
  })),
  { email: "owner@srbmaury.com", name: "Demo Hiring Owner", role: "user" },
  { email: "recruiter1@srbmaury.com", name: "Demo Recruiter 1", role: "user" },
  { email: "recruiter2@srbmaury.com", name: "Demo Recruiter 2", role: "user" },
  { email: "manager1@srbmaury.com", name: "Demo Hiring Manager 1", role: "user" },
  { email: "reviewer1@srbmaury.com", name: "Demo Reviewer 1", role: "user" },
  { email: "reviewer2@srbmaury.com", name: "Demo Reviewer 2", role: "user" },
  { email: "owner2@srbmaury.com", name: "Demo Hiring Owner 2", role: "user" },
  { email: "orgadmin2@srbmaury.com", name: "Demo Organization Admin 2", role: "user" },
  { email: "recruiter3@srbmaury.com", name: "Demo Recruiter 3", role: "user" },
  { email: "recruiter4@srbmaury.com", name: "Demo Recruiter 4", role: "user" },
  { email: "manager2@srbmaury.com", name: "Demo Hiring Manager 2", role: "user" },
  { email: "reviewer3@srbmaury.com", name: "Demo Reviewer 3", role: "user" },
  { email: "reviewer4@srbmaury.com", name: "Demo Reviewer 4", role: "user" },
];

const organizations = [
  {
    name: "Srbmaury Demo Engineering",
    ownerEmail: "owner@srbmaury.com",
    members: [
      ["owner@srbmaury.com", "owner"],
      ["recruiter1@srbmaury.com", "recruiter"],
      ["recruiter2@srbmaury.com", "recruiter"],
      ["manager1@srbmaury.com", "hiring_manager"],
      ["reviewer1@srbmaury.com", "reviewer"],
      ["reviewer2@srbmaury.com", "reviewer"],
    ],
  },
  {
    name: "Srbmaury Demo Talent",
    ownerEmail: "owner2@srbmaury.com",
    members: [
      ["owner2@srbmaury.com", "owner"],
      ["orgadmin2@srbmaury.com", "admin"],
      ["recruiter3@srbmaury.com", "recruiter"],
      ["recruiter4@srbmaury.com", "recruiter"],
      ["manager2@srbmaury.com", "hiring_manager"],
      ["reviewer3@srbmaury.com", "reviewer"],
      ["reviewer4@srbmaury.com", "reviewer"],
      ["recruiter2@srbmaury.com", "reviewer"],
      ["manager1@srbmaury.com", "recruiter"],
    ],
  },
];

await mongoose.connect(process.env.MONGO_URI);

try {
  const userByEmail = new Map();

  for (const def of users) {
    const email = def.email.toLowerCase();
    if (await User.exists({ email })) throw new Error("Use a fresh demo database. An account already exists.");
    const user = new User({
      name: def.name,
      email,
      password: process.env.DEMO_PASSWORD,
      provider: "local",
      isVerified: true,
      role: "user",
    });

    await user.save();
    userByEmail.set(email, user);
  }

  for (const def of organizations) {
    const owner = userByEmail.get(def.ownerEmail);
    let org = await Organization.findOne({ name: def.name, createdBy: owner._id });

    if (!org) {
      org = await Organization.create({
        name: def.name,
        createdBy: owner._id,
        hiringPlan: "trial",
        hiringTrialEligible: true,
      });
    } else if (!["starter", "growth", "enterprise"].includes(org.hiringPlan)) {
      org.hiringPlan = "trial";
      org.hiringTrialEligible = true;
      await org.save();
    }

    owner.hiringTrialClaimed = true;
    await owner.save();

    for (const [email, role] of def.members) {
      const user = userByEmail.get(email);
      await OrganizationMembership.findOneAndUpdate(
        { organization: org._id, user: user._id },
        {
          $set: { role, status: "active", joinedAt: new Date() },
          $setOnInsert: { organization: org._id, user: user._id },
        },
        { upsert: true, new: true, runValidators: true },
      );
    }
  }

  console.log(`Seeded ${users.length} verified @srbmaury.com accounts and ${organizations.length} organizations.`);
  console.log("No verification emails were sent.");
} finally {
  await mongoose.disconnect();
}
