import assert from "node:assert/strict";
import test from "node:test";

import {
  describeReminderChannel,
  isValidReminderPhone,
  normalizeReminderPhone,
  selectedReminderChannels,
} from "../lib/reminder-preferences.ts";

test("phone validation only accepts E.164 numbers with a country code", () => {
  for (const valid of ["+2348012345678", "+15551234567", "+447700900123", "+12345678"]) {
    assert.equal(isValidReminderPhone(valid), true, valid);
  }
  for (const invalid of [
    "",
    "08012345678",
    "2348012345678",
    // Fewer than 8 digits in total, and more than the 15 that E.164 allows.
    "+1234567",
    "+1234567890123456",
    "+234 801 234 5678",
    "+02348012345678",
    "+234801234567a",
  ]) {
    assert.equal(isValidReminderPhone(invalid), false, invalid);
  }
});

test("surrounding whitespace is trimmed before validating", () => {
  assert.equal(normalizeReminderPhone("  +2348012345678  "), "+2348012345678");
  assert.equal(isValidReminderPhone("  +2348012345678  "), true);
});

test("email and WhatsApp are selected independently", () => {
  assert.deepEqual(selectedReminderChannels({ emailEnabled: true, whatsappEnabled: true }), ["email", "whatsapp"]);
  assert.deepEqual(selectedReminderChannels({ emailEnabled: true, whatsappEnabled: false }), ["email"]);
  assert.deepEqual(selectedReminderChannels({ emailEnabled: false, whatsappEnabled: true }), ["whatsapp"]);
  assert.deepEqual(selectedReminderChannels({ emailEnabled: false, whatsappEnabled: false }), []);
});

test("a channel stays selectable when its provider is not configured", () => {
  // Regression guard: the UI once disabled both checkboxes until Resend and
  // Meta existed, which made the preference impossible to set at all.
  const none = { email: false, whatsapp: false };
  for (const channel of ["email", "whatsapp"] as const) {
    assert.equal(describeReminderChannel(channel, none).selectable, true, channel);
  }
  // Only one provider present must not disable the other channel either.
  assert.equal(describeReminderChannel("email", { email: false, whatsapp: true }).selectable, true);
  assert.equal(describeReminderChannel("whatsapp", { email: false, whatsapp: true }).selectable, true);
});

test("deliverability follows provider configuration", () => {
  const none = { email: false, whatsapp: false };
  assert.equal(describeReminderChannel("email", none).deliverable, false);
  assert.equal(describeReminderChannel("whatsapp", none).deliverable, false);

  const both = { email: true, whatsapp: true };
  assert.equal(describeReminderChannel("email", both).deliverable, true);
  assert.equal(describeReminderChannel("whatsapp", both).deliverable, true);

  const emailOnly = { email: true, whatsapp: false };
  assert.equal(describeReminderChannel("email", emailOnly).deliverable, true);
  assert.equal(describeReminderChannel("whatsapp", emailOnly).deliverable, false);
});

test("the status line names exactly what is missing", () => {
  const none = { email: false, whatsapp: false };
  assert.equal(
    describeReminderChannel("email", none).status,
    "Not configured yet: add Resend keys to send",
  );
  assert.equal(
    describeReminderChannel("whatsapp", none).status,
    "Not configured yet: add Meta API keys and an approved template to send",
  );
  assert.equal(describeReminderChannel("email", { email: true, whatsapp: false }).status, "Ready to send");
  assert.equal(describeReminderChannel("whatsapp", { email: false, whatsapp: true }).status, "Ready to send");
});
