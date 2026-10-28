const $ = (id) => document.getElementById(id)

async function show() {
  const cfg = await chrome.runtime.sendMessage({ type: 'config' })
  const who = $('who')
  $('login').hidden = true
  if (!cfg.ok || !cfg.data.loggedIn) {
    who.textContent = 'Siz hali GapirAI hisobiga kirmagansiz.'
    $('login').hidden = false
    return
  }
  const me = await chrome.runtime.sendMessage({ type: 'api', path: '/auth/me' })
  if (!me.ok) {
    who.textContent = me.error
    $('login').hidden = !me.login
    return
  }
  who.textContent = ''
  const s = document.createElement('span')
  s.className = 'ok'
  s.textContent = `Ulangan: ${me.data.email || me.data.name}`
  who.append(s)
}

$('login').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open', path: '/login' }))
$('server').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ server: e.target.value })
  show()
})
chrome.storage.local.get('server').then(({ server }) => { $('server').value = server || 'prod' })
$('version').textContent = `v${chrome.runtime.getManifest().version}`
show()
