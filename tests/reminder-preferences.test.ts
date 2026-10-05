import assert from "node:assert/strict";
import test from "node:test";

import {
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
