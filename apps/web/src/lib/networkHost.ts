/** localhost는 NCP에 보통 이미 등록되어 있음 */
export function isPrivateLanHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return false
  return /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)
}

/**
 * NCP Web 서비스 URL 등록 값 (공식 예시: http://naver.com — 경로·`*` 없이 origin만)
 * @see https://guide.ncloud-docs.com/docs/application-maps-app-vpc
 */
export function ncpWebUrlPatternsForOrigin(origin: string): string[] {
  const base = origin.replace(/\/$/, '')
  return [base]
}

export function buildNcpMapLanAuthHint(origin: string, hostname: string): string | null {
  if (!isPrivateLanHostname(hostname)) return null
  const patterns = ncpWebUrlPatternsForOrigin(origin)
  return [
    '네이버 지도 Open API는 접속 주소(URL)가 NCP에 등록되어 있어야 해요.',
    '콘솔 → Services → Application → 해당 앱 → Web 서비스 URL에 아래를 추가한 뒤 저장하세요.',
    ...patterns,
  ].join('\n')
}
