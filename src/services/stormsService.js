export async function fetchStorms() {
  const res = await fetch('/hazards/storms.json')
  if (!res.ok) throw new Error(`Failed to load storms.json (${res.status})`)
  return await res.json()
}