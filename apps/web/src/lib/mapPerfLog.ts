/** dev 전용 — 정보 요약형 핀·지도 렌더 성능 로그 (브라우저 콘솔) */
export function mapPerfLog(phase: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return
  console.log(`[PinTravel perf:${phase}]`, payload)
}

export function estimateJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}
