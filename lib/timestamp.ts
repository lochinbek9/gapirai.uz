// Learning Workspace tablari (transkript/chapter/quiz/AI-ustoz) bir xil
// "m:ss" / "h:mm:ss" formatida timestamp ko'rsatadi -- shu yerda yagona
// manba, har bir tab komponentida takrorlanmaydi.
export function formatTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0
    ? `${h}:${mm.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${mm}:${sec.toString().padStart(2, '0')}`
}
