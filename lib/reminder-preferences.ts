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

const MISSING_SETUP: Record<ReminderChannel, string> = {
  email: "add Resend keys",
  whatsapp: "add Meta API keys and an approved template",
};

export type ReminderChannelState = {
  /** Always true. The preference must be savable before a provider exists. */
  selectable: true;
  /** True only when a real message can be sent for this channel. */
  deliverable: boolean;
  status: string;
};

/**
 * Describes a channel for the settings UI. Selection is never blocked on
 * provider configuration: a workspace should be able to state its preference
 * first and light up delivery once credentials are added. Only `deliverable`
 * reflects the environment.
 */
export function describeReminderChannel(
  channel: ReminderChannel,
  configured: Readonly<Record<ReminderChannel, boolean>>,
): ReminderChannelState {
  const missing = MISSING_SETUP[channel];
  return {
    selectable: true,
    deliverable: configured[channel],
    status: configured[channel] ? "Ready to send" : `Not configured yet: ${missing} to send`,
  };
}
