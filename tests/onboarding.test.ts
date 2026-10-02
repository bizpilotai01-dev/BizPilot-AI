import test from "node:test";
import assert from "node:assert/strict";

import { createBusiness, createProfile, profiles } from "../lib/store";

test("createProfile creates an owner profile for a new business", () => {
  const before = profiles.length;
  const business = createBusiness({
    name: "Acme Digital",
    industry: "Technology",
    ownerId: "user_onboard_001",
  });

  const profile = createProfile({
    name: "Ada Okafor",
    email: "ada@acmedigital.ng",
    role: "owner",
    businessId: business.id,
  });

  assert.equal(profile.businessId, business.id);
  assert.equal(profile.role, "owner");
  assert.ok(profiles.some((item) => item.email === "ada@acmedigital.ng"));
  assert.equal(profiles.length, before + 1);
});
