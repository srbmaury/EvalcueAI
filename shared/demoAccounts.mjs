export const demoUsers = [
  ...Array.from({ length: 10 }, (_, i) => ({
    email: `candidate${String(i + 1).padStart(2, "0")}@example.test`,
    name: `Demo Candidate ${String(i + 1).padStart(2, "0")}`,
    role: "user",
  })),
  { email: "owner@example.test", name: "Demo Hiring Owner", role: "user" },
  { email: "recruiter1@example.test", name: "Demo Recruiter 1", role: "user" },
  { email: "recruiter2@example.test", name: "Demo Recruiter 2", role: "user" },
  { email: "manager1@example.test", name: "Demo Hiring Manager 1", role: "user" },
  { email: "reviewer1@example.test", name: "Demo Reviewer 1", role: "user" },
  { email: "reviewer2@example.test", name: "Demo Reviewer 2", role: "user" },
  { email: "owner2@example.test", name: "Demo Hiring Owner 2", role: "user" },
  { email: "orgadmin2@example.test", name: "Demo Organization Admin 2", role: "user" },
  { email: "recruiter3@example.test", name: "Demo Recruiter 3", role: "user" },
  { email: "recruiter4@example.test", name: "Demo Recruiter 4", role: "user" },
  { email: "manager2@example.test", name: "Demo Hiring Manager 2", role: "user" },
  { email: "reviewer3@example.test", name: "Demo Reviewer 3", role: "user" },
  { email: "reviewer4@example.test", name: "Demo Reviewer 4", role: "user" },
];

export const demoOrganizations = [
  {
    name: "Srbmaury Demo Engineering",
    ownerEmail: "owner@example.test",
    members: [
      ["owner@example.test", "owner"],
      ["recruiter1@example.test", "recruiter"],
      ["recruiter2@example.test", "recruiter"],
      ["manager1@example.test", "hiring_manager"],
      ["reviewer1@example.test", "reviewer"],
      ["reviewer2@example.test", "reviewer"],
    ],
  },
  {
    name: "Srbmaury Demo Talent",
    ownerEmail: "owner2@example.test",
    members: [
      ["owner2@example.test", "owner"],
      ["orgadmin2@example.test", "admin"],
      ["recruiter3@example.test", "recruiter"],
      ["recruiter4@example.test", "recruiter"],
      ["manager2@example.test", "hiring_manager"],
      ["reviewer3@example.test", "reviewer"],
      ["reviewer4@example.test", "reviewer"],
      ["recruiter2@example.test", "reviewer"],
      ["manager1@example.test", "recruiter"],
    ],
  },
];
