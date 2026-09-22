/** Web Push subscribe helpers -- used by messages.astro to let a signed-in
 *  visitor opt into a notification when someone sends them a DM. Kept
 *  framework-free (plain browser APIs) so it works the same from any page. */
import type { SupabaseClient } from '@supabase/supabase-js';

// The "public" half of the site's VAPID keypair. Safe to ship in client
// code by design -- it's only usable to *request* a push subscription, not
// to send one, which needs the private half held server-side in the
// send-message-push Edge Function and nowhere else.
const VAPID_PUBLIC_KEY = 'BFyhm-B1Idmt_m-A-QDLeLbGGEfvst6_S5DIZBUp6XDF44fqW1FGXhT38G70aN-9wA6C4kvly2A93gPa5n_NhJU';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

/** Returns the existing subscription for this browser, if any -- without
 *  prompting for permission. Used to skip the "enable notifications" prompt
 *  for someone who already said yes on this device. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function saveSubscription(supabase: SupabaseClient, userId: string, sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' }
  );
}

/** Asks for notification permission (must be called from a click handler --
 *  browsers ignore or auto-block a permission request that isn't tied to a
 *  user gesture) and, if granted, subscribes and saves the subscription. */
export async function enablePush(
  supabase: SupabaseClient,
  userId: string
): Promise<'subscribed' | 'denied' | 'unsupported' | 'error'> {
  if (!pushSupported()) return 'unsupported';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await saveSubscription(supabase, userId, sub);
    return 'subscribed';
  } catch (err) {
    console.warn('Push subscribe failed:', err);
    return 'error';
  }
}
