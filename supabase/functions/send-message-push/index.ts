// supabase/functions/send-message-push/index.ts
//
// Called by a Supabase Database Webhook every time a row is inserted into
// public.messages. Looks up the recipient's push subscriptions and sends
// each one a Web Push notification via VAPID. See the PWA setup guide for
// how to deploy this and wire up the webhook.
//
// Required secrets (set with `supabase secrets set`, or in the dashboard
// under Edge Functions -> send-message-push -> Secrets):
//   VAPID_PUBLIC_KEY      -- same value baked into src/lib/push.ts
//   VAPID_PRIVATE_KEY     -- never goes anywhere else
//   VAPID_SUBJECT         -- a mailto: address, required by the Web Push spec
//   WEBHOOK_SECRET        -- a random string only this function and the
//                            Database Webhook know, so a stranger who finds
//                            this function's URL can't use it to spam an
//                            arbitrary user with a fake "new message" push
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Edge Functions runtime -- nothing to set for those two.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@380tonight.com';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let record: { sender_id?: string; recipient_id?: string; body?: string | null; photo_url?: string | null };
  try {
    const payload = await req.json();
    // Supabase Database Webhooks send { type, table, record, old_record }.
    // Tolerate being called directly with just the row, too.
    record = payload.record ?? payload;
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const { sender_id, recipient_id, body, photo_url } = record ?? {};
  if (!sender_id || !recipient_id) {
    return new Response('ignored: missing sender/recipient', { status: 200 });
  }

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', recipient_id);

  if (subsError) {
    console.error('push_subscriptions lookup failed:', subsError);
    return new Response('error', { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return new Response('ok: recipient has no subscriptions', { status: 200 });
  }

  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', sender_id)
    .maybeSingle();

  const senderName = senderProfile?.display_name || 'Someone';
  const preview = body
    ? body.length > 80 ? body.slice(0, 77) + '...' : body
    : photo_url ? 'Sent a photo' : 'New message';
  const clickUrl = senderProfile?.username
    ? `/messages/?u=${encodeURIComponent(senderProfile.username)}`
    : '/messages/';

  const notificationPayload = JSON.stringify({
    title: senderName,
    body: preview,
    url: clickUrl,
    tag: `message-${sender_id}`,
  });

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notificationPayload
        );
      } catch (err: any) {
        // 404/410 means the subscription is gone (uninstalled, permission
        // revoked, etc.) -- delete it so we stop trying it every time.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  return new Response(`ok: sent ${sent}/${subs.length}`, { status: 200 });
});
