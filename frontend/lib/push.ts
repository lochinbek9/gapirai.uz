import { getVapidKey, savePushSubscription, deletePushSubscription } from './api'

// Web Push obuna oqimi. Service worker (public/sw.js) allaqachon 'push' va
// 'notificationclick' handlerlariga ega — bu yerda faqat ruxsat + obuna.

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const buf = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buf)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed'

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) return 'subscribed'
  return Notification.permission === 'granted' ? 'default' : 'default'
}

export async function enablePush(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'unsupported'
  }
  const key = await getVapidKey()
  if (!key) return 'unsupported' // server push'ni yoqmagan

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default'

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    })
  }
  await savePushSubscription(sub.toJSON() as PushSubscriptionJSON, navigator.userAgent)
  return 'subscribed'
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready.catch(() => null)
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
}
