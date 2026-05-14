const WebSocket  = require('ws')
const autoCrawl  = require('./autoCrawl')

const WS_URL = 'wss://livewk.xosodaiphat.com/'
const WS_HEADERS = {
  Origin: 'https://xosodaiphat.com',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
}

const MN_MT_PRIZE_KEYS = ['eighth','seventh','sixth','fifth','fourth','third','second','first','special']
const MB_PRIZE_KEYS    = ['special','first','second','third','fourth','fifth','sixth','seventh']
const GROUP_REGION     = { 1: 'mb', 2: 'mn', 3: 'mt' }

// Long polling: waiter = { resolve, timer }
// Mỗi region có 1 hàng đợi các request đang chờ data mới
const waiters = { mb: [], mt: [], mn: [] }

// Data mới nhất theo từng region — trả ngay cho client nếu có
const latestData = {}

// Theo dõi trạng thái "tất cả đài đã xong" để detect transition → trigger crawl
const allDoneState = { mb: false, mn: false, mt: false }

let ws = null
let reconnectTimer = null

// ─── Parser ──────────────────────────────────────────────────────────────────

function parseNumbers(raw) {
  if (!raw) return []
  return raw.split('-').map(s => s.trim()).filter(Boolean)
}

function parseStation(chunk, prizeKeys) {
  const atIdx = chunk.indexOf('@')
  const meta     = atIdx === -1 ? chunk : chunk.slice(0, atIdx)
  const prizeRaw = atIdx === -1 ? ''    : chunk.slice(atIdx + 1)

  const [status, lotteryId, code, name] = meta.split('|')
  const prizeParts = prizeRaw.split('|')
  const prizes = {}
  prizeKeys.forEach((key, i) => {
    const nums = parseNumbers(prizeParts[i])
    if (nums.length) prizes[key] = nums
  })

  return { lotteryCode: code, lotteryName: name, lotteryId, status: Number(status), prizes }
}

function parseMessage(raw) {
  const bangIdx = raw.indexOf('!')
  if (bangIdx === -1) return null

  const groupId = Number(raw.slice(0, bangIdx).split('|')[1])
  const region  = GROUP_REGION[groupId]
  if (!region) return null

  const prizeKeys = region === 'mb' ? MB_PRIZE_KEYS : MN_MT_PRIZE_KEYS
  const stations  = raw.slice(bangIdx + 1)
    .split('!')
    .map(c => parseStation(c, prizeKeys))
    .filter(s => s.lotteryCode)

  return { region, stations, ts: Date.now() }
}

// ─── Long polling ─────────────────────────────────────────────────────────────

// Khi có data mới → resolve tất cả waiter đang chờ region đó
function notifyWaiters(region, payload) {
  latestData[region] = payload
  const list = waiters[region].splice(0)   // lấy hết, clear mảng
  list.forEach(({ resolve, timer }) => {
    clearTimeout(timer)
    resolve(payload)
  })
}

/**
 * Trả về Promise:
 *  - Resolve ngay nếu có data mới hơn `since`
 *  - Resolve sau khi có data mới (tối đa `timeout` ms)
 *  - Resolve với null nếu timeout (client sẽ poll lại)
 */
function waitForUpdate(region, since, timeout = 25000) {
  const latest = latestData[region]
  if (latest && latest.ts > since) return Promise.resolve(latest)

  ensureConnected()

  return new Promise(resolve => {
    const timer = setTimeout(() => {
      const idx = waiters[region].findIndex(w => w.resolve === resolve)
      if (idx !== -1) waiters[region].splice(idx, 1)
      resolve(null)   // timeout → client poll lại
    }, timeout)

    waiters[region].push({ resolve, timer })
  })
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

function connect() {
  if (ws) return

  ws = new WebSocket(WS_URL, { headers: WS_HEADERS })

  ws.on('open', () => console.log('[Live] WebSocket connected'))

  ws.on('message', raw => {
    const text = raw.toString()
    if (text === '0' || text === '1') return
    try {
      const parsed = parseMessage(text)
      if (!parsed) return

      const { region, stations, ts } = parsed
      notifyWaiters(region, { ok: true, stations, ts })

      // Khi toàn bộ đài hoàn thành lần đầu → trigger auto crawl
      const allDone = stations.length > 0 && stations.every(s => s.status === 1)
      if (allDone && !allDoneState[region]) {
        allDoneState[region] = true
        autoCrawl.triggerCrawl(region)
      } else if (!allDone) {
        // Reset để hôm sau detect lại được
        allDoneState[region] = false
      }
    } catch (e) {
      console.error('[Live] Parse error:', e.message)
    }
  })

  ws.on('close', () => {
    console.log('[Live] WebSocket closed, reconnecting in 3s...')
    ws = null
    reconnectTimer = setTimeout(connect, 3000)
  })

  ws.on('error', err => {
    console.error('[Live] WebSocket error:', err.message)
    ws?.terminate()
    ws = null
    if (!reconnectTimer) reconnectTimer = setTimeout(connect, 3000)
  })
}

function ensureConnected() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (!ws || ws.readyState > WebSocket.OPEN) connect()
}

// Gọi 1 lần khi server khởi động để WebSocket luôn sẵn sàng
function initWebSocket() {
  ensureConnected()
}

module.exports = { waitForUpdate, initWebSocket }
