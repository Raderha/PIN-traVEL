/**
 * 세션 초대 URL용 origin.
 * 호스트가 localhost로 접속하면 같은 Wi‑Fi의 다른 PC에서는 접속할 수 없어 LAN IP로 바꿉니다.
 */
function isLocalHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function originWithHost(protocol: string, host: string, port: string) {
  const p = port && port !== '80' && port !== '443' ? `:${port}` : ''
  return `${protocol}//${host}${p}`
}

/** WebRTC ICE 후보에서 사설 IPv4 추출(브라우저 전용, dev 편의) */
function discoverLanIpv4(timeoutMs = 2000): Promise<string | null> {
  if (typeof window === 'undefined' || !window.RTCPeerConnection) return Promise.resolve(null)

  return new Promise((resolve) => {
    let settled = false
    const done = (ip: string | null) => {
      if (settled) return
      settled = true
      try {
        pc.close()
      } catch {
        /* ignore */
      }
      resolve(ip)
    }

    const pc = new RTCPeerConnection({ iceServers: [] })
    pc.createDataChannel('pintravel')
    pc.onicecandidate = (ev) => {
      const cand = ev.candidate?.candidate
      if (!cand) return
      const m = /(\d{1,3}(?:\.\d{1,3}){3})/.exec(cand)
      const ip = m?.[1]
      if (!ip || ip.startsWith('127.')) return
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(ip)) done(ip)
    }
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => done(null))

    window.setTimeout(() => done(null), timeoutMs)
  })
}

export async function resolveShareableOrigin(): Promise<string> {
  const { protocol, port, hostname, origin } = window.location
  if (!isLocalHostname(hostname)) return origin

  const envHost = import.meta.env.VITE_DEV_LAN_HOST?.trim()
  if (envHost) return originWithHost(protocol, envHost, port)

  const ip = await discoverLanIpv4()
  if (ip) return originWithHost(protocol, ip, port)

  return origin
}
