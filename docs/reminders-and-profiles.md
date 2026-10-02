# Reminders and profile photos

## Database setup

Run the updated `supabase/schema.sql` in the Supabase SQL Editor. It adds workspace profile photo and reminder-preference columns, creates the private `profile-photos` bucket, and creates the `reminder_deliveries` table.

## In-app reminders

The dashboard lists pending tasks and labels tasks due tomorrow, due today, and overdue. In-app reminders do not require external credentials.

## Email reminders

BizPilot sends an opted-in daily digest through Resend for pending tasks due tomorrow or overdue, in the `Africa/Lagos` timezone. Configure:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` using a sender address verified with Resend
- `CRON_SECRET` with a long, random value

## WhatsApp reminders

BizPilot sends an opted-in WhatsApp template message using Meta's WhatsApp Cloud API. Configure:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_REMINDER_TEMPLATE` with an approved template that has one text placeholder in its body (for example: `Your follow-up reminders: {{1}} Review tasks in BizPilot.`)
- `WHATSAPP_TEMPLATE_LANGUAGE` matching the template language (defaults to `en`)
- `CRON_SECRET`

Workspace members must explicitly opt in and save their number in international E.164 format (for example, `+2348012345678`). Meta template approval and WhatsApp consent requirements still apply.

The API sends the recipient number to Meta as digits only, removing the leading `+` from the saved E.164 value.

## Scheduler

`vercel.json` invokes the digest at 07:00 UTC daily, which is 08:00 in Lagos. Vercel sends `CRON_SECRET` as a bearer token. For other hosting providers, schedule a daily `GET /api/reminders/send` request with `Authorization: Bearer <CRON_SECRET>`.

Delivery attempts are tracked once per profile, channel, and Lagos date. Failed deliveries are eligible for retry on a later cron invocation that same day.

## Team profile photos

The updated schema creates a private `profile-photos` bucket. Workspace members can upload their own JPG, PNG, or WebP profile photo (up to 3 MB) from the dashboard team panel. Other members can see the signed photo URL for one hour; only the signed-in member can replace their own photo.
