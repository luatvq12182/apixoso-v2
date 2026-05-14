;(function () {
  'use strict'

  // MN/MT: G.8 trên cùng → G.ĐB dưới cùng (theo thứ tự quay thực tế)
  const MN_MT_ORDER = ['eighth','seventh','sixth','fifth','fourth','third','second','first','special']
  // MB: G.ĐB trên → G.7 dưới
  const MB_ORDER    = ['special','first','second','third','fourth','fifth','sixth','seventh']

  const PRIZE_LABEL = {
    special: 'G.ĐB', first: '1', second: '2', third:   '3',
    fourth:  '4',    fifth: '5', sixth:  '6', seventh: '7', eighth: '8',
  }

  // Khung giờ live: [phút bắt đầu, phút kết thúc] tính từ 00:00
  const LIVE_WINDOWS = {
    mn: [16 * 60 + 10, 17 * 60 + 5],   // 16:10 – 17:05
    mt: [17 * 60 + 10, 18 * 60 + 5],   // 17:10 – 18:05
    mb: [18 * 60 + 10, 19 * 60 + 5],   // 18:10 – 19:05
  }

  function nowMins() {
    var d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  }

  function isLiveTime(region) {
    var w = LIVE_WINDOWS[region]
    if (!w) return false
    var m = nowMins()
    return m >= w[0] && m <= w[1]
  }

  // ─── Auto-select region by time ────────────────────────────────────────────

  function autoRegion() {
    var mins = nowMins()
    if (mins >= LIVE_WINDOWS.mn[0] && mins <= LIVE_WINDOWS.mn[1]) return 'mn'
    if (mins >= LIVE_WINDOWS.mt[0] && mins <= LIVE_WINDOWS.mt[1]) return 'mt'
    if (mins >= LIVE_WINDOWS.mb[0] && mins <= LIVE_WINDOWS.mb[1]) return 'mb'
    if (mins < LIVE_WINDOWS.mn[0]) return 'mn'
    if (mins < LIVE_WINDOWS.mt[0]) return 'mt'
    return 'mb'
  }

  // ─── Instance ──────────────────────────────────────────────────────────────

  function KqxsLive(wrap) {
    this.wrap          = wrap
    this.grid          = wrap.querySelector('.kqxs-grid')
    this.dot           = wrap.querySelector('.kqxs-dot')
    this.statusLabel   = wrap.querySelector('.kqxs-status-label')
    this.lastUpdateEl  = wrap.querySelector('.kqxs-last-update')
    this.proxyBase     = (window.KqxsLiveConfig || {}).proxyBase    || '/wp-json/kqxs/v1/live'
    this.resultsBase   = (window.KqxsLiveConfig || {}).resultsBase  || '/wp-json/kqxs/v1/results'
    this.region        = null
    this.polling       = false
    this.lastTs        = 0
    this._autoLiveTimer = null

    var self = this
    wrap.querySelectorAll('.kqxs-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { self.switchRegion(tab.dataset.region) })
    })

    var init = wrap.dataset.initRegion || autoRegion()
    this.switchRegion(init)
  }

  KqxsLive.prototype.switchRegion = function (region) {
    if (this.region === region) return
    this.polling = false
    this.region  = region
    this.lastTs  = 0
    clearTimeout(this._autoLiveTimer)
    this._autoLiveTimer = null

    this.wrap.querySelectorAll('.kqxs-tab').forEach(function (t) {
      t.classList.toggle('kqxs-tab--active', t.dataset.region === region)
    })

    this._startForRegion(region)
  }

  KqxsLive.prototype._startForRegion = function (region) {
    if (isLiveTime(region)) {
      this.setMessage('Đang kết nối trực tiếp...')
      this.setStatus('wait')
      this.polling = true
      this._poll(region)
    } else {
      this.setStatus('wait')
      this._loadLatest(region)
      this._scheduleAutoLive(region)
    }
  }

  // Tải kết quả mới nhất (ngoài giờ live)
  KqxsLive.prototype._loadLatest = async function (region) {
    try {
      var res  = await fetch(this.resultsBase + '/' + region)
      var data = await res.json()

      if (!data.success || !data.data || !data.data.length || !data.data[0].results.length) {
        this.setMessage('Chưa có kết quả. Đang chờ giờ quay thưởng...')
        this.setStatus('wait')
        return
      }

      var entry    = data.data[0]
      var stations = entry.results.map(function (r) {
        return {
          lotteryName:  r.province ? r.province.name : '—',
          status:       1,
          prizes:       r.prizes || {},
          specialCodes: [],
        }
      })

      this.render({ ok: true, stations: stations, ts: null })
      this.setStatus('done')
      if (this.statusLabel) this.statusLabel.textContent = 'Kết quả ngày ' + entry.date
    } catch (e) {
      this.setMessage('Không thể tải kết quả.')
      this.setStatus('off')
    }
  }

  // Hẹn giờ tự chuyển sang live polling khi đến giờ quay
  KqxsLive.prototype._scheduleAutoLive = function (region) {
    var self  = this
    var w     = LIVE_WINDOWS[region]
    if (!w) return

    var m        = nowMins()
    var startMin = w[0]
    if (m >= startMin) return   // đã qua giờ bắt đầu

    var now      = new Date()
    var msUntil  = (startMin - m) * 60000 - now.getSeconds() * 1000 - now.getMilliseconds()

    this._autoLiveTimer = setTimeout(function () {
      if (self.region !== region) return
      self.polling = true
      self.lastTs  = 0
      self.setMessage('Đang kết nối trực tiếp...')
      self.setStatus('wait')
      self._poll(region)
    }, msUntil)
  }

  KqxsLive.prototype._poll = async function (region) {
    while (this.polling && this.region === region) {
      try {
        var res  = await fetch(this.proxyBase + '/' + region + '?since=' + this.lastTs)
        if (!this.polling || this.region !== region) break
        var data = await res.json()
        if (data.timeout) continue
        if (data.ok && data.stations && data.stations.length) {
          this.lastTs = data.ts
          this.render(data)
          // Dừng polling khi tất cả đài đã hoàn thành
          if (data.stations.every(function (s) { return s.status === 1 })) {
            this.polling = false
            break
          }
        }
      } catch (e) {
        this.setStatus('off')
        await new Promise(function (r) { setTimeout(r, 3000) })
      }
    }
  }

  // ─── Render: 1 bảng gộp, tỉnh = cột, giải = hàng ─────────────────────────

  KqxsLive.prototype.render = function (payload) {
    if (!payload.ok) {
      this.setMessage('Lỗi: ' + (payload.error || 'Không xác định'))
      this.setStatus('off')
      return
    }

    var stations = payload.stations || []
    if (!stations.length) {
      this.setMessage('Chưa có dữ liệu. Chưa đến giờ quay thưởng.')
      this.setStatus('wait')
      return
    }

    var allDone = stations.every(function (s) { return s.status === 1 })
    this.setStatus(allDone ? 'done' : 'live')

    var isMB   = this.region === 'mb'
    var order  = isMB ? MB_ORDER : MN_MT_ORDER

    // ── thead: tên tỉnh + trạng thái ──────────────────────────────────────
    var headCols = stations.map(function (s) {
      var st    = s.status === 1 ? 'done' : s.status === 2 ? 'live' : 'pending'
      var label = s.status === 1 ? 'Hoàn thành' : s.status === 2 ? 'Đang quay' : 'Chờ quay'
      return '<th class="kqxs-col-province">' +
        '<span class="kqxs-province-name">' + (s.lotteryName || '—') + '</span>' +
        '<span class="kqxs-status--' + st + '">' + label + '</span>' +
        '</th>'
    }).join('')

    var thead = '<thead>' +
      '<tr><th class="kqxs-col-label">Giải</th>' + headCols + '</tr>'

    // Hàng Mã ĐB (chỉ MB)
    if (isMB && stations[0]) {
      var codes = (stations[0].specialCodes || []).join(' ') || '—'
      thead += '<tr class="kqxs-madb-row">' +
        '<td class="kqxs-col-label">Mã ĐB</td>' +
        '<td colspan="' + stations.length + '" class="kqxs-madb-codes">' + codes + '</td>' +
        '</tr>'
    }
    thead += '</thead>'

    // ── tbody: từng hàng giải ──────────────────────────────────────────────
    var tbody = '<tbody>'
    order.forEach(function (key) {
      var lbl  = PRIZE_LABEL[key]
      var cols = stations.map(function (s) {
        var nums = s.prizes && s.prizes[key]
        if (!nums || !nums.length) {
          return '<td class="kqxs-prize-nums"><span class="kqxs-num kqxs-num--pending">...</span></td>'
        }
        var spans = nums.map(function (n) {
          if (!n || n === '...') return '<span class="kqxs-num kqxs-num--pending">...</span>'
          return '<span class="kqxs-num kqxs-num--' + key + '">' + n + '</span>'
        }).join('')
        return '<td class="kqxs-prize-nums">' + spans + '</td>'
      }).join('')

      tbody += '<tr class="kqxs-row kqxs-row--' + key + '">' +
        '<td class="kqxs-col-label">' + lbl + '</td>' +
        cols +
        '</tr>'
    })
    tbody += '</tbody>'

    this.grid.innerHTML = '<table class="kqxs-table">' + thead + tbody + '</table>'

    if (payload.ts) {
      var t  = new Date(payload.ts)
      var hh = String(t.getHours()).padStart(2, '0')
      var mm = String(t.getMinutes()).padStart(2, '0')
      var ss = String(t.getSeconds()).padStart(2, '0')
      this.lastUpdateEl.textContent = 'Cập nhật ' + hh + ':' + mm + ':' + ss
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  KqxsLive.prototype.setStatus = function (state) {
    if (this.dot)         this.dot.dataset.state = state
    if (this.statusLabel) {
      this.statusLabel.textContent = {
        live: 'Đang nhận dữ liệu trực tiếp',
        wait: 'Đang kết nối...',
        done: 'Đã có kết quả đầy đủ',
        off:  'Mất kết nối',
      }[state] || ''
    }
  }

  KqxsLive.prototype.setMessage = function (msg) {
    this.grid.innerHTML = '<div class="kqxs-message">' + msg + '</div>'
  }

  // ─── Boot ──────────────────────────────────────────────────────────────────

  function init() {
    document.querySelectorAll('.kqxs-live-wrap').forEach(function (wrap) {
      if (!wrap.__kqxs) wrap.__kqxs = new KqxsLive(wrap)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
