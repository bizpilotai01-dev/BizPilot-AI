/** E.164-style numbers only, because WhatsApp addressing needs a country code. */
const INTERNATIONAL_PHONE = /^\+[1-9]\d{7,14}$/;

export function normalizeReminderPhone(value: string): string {
  return value.trim();
}

export function isValidReminderPhone(value: string): boolean {
  return INTERNATIONAL_PHONE.test(normalizeReminderPhone(value));
}

export type ReminderChannel = "email" | "whatsapp";

export const REMINDER_CHANNELS: readonly ReminderChannel[] = ["email", "whatsapp"];

/**
 * Which channels a profile asked for. Both flags are independent, so a profile
 * can receive email only, WhatsApp only, or both.
 */
export function selectedReminderChannels(preferences: {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}): ReminderChannel[] {
  return REMINDER_CHANNELS.filter((channel) =>
    channel === "email" ? preferences.emailEnabled : preferences.whatsappEnabled,
  );
}
