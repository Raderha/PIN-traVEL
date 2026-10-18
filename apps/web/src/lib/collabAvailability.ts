/**
 * 실시간 협업(Socket.IO)은 Lambda 배포에 포함되지 않는다.
 * 로컬 `npm run dev`에서만 기본 활성. 프로덕션에서 켜려면 VITE_COLLAB_SESSIONS=1.
 */
export function areCollabSessionsEnabled(): boolean {
  const v = String(import.meta.env.VITE_COLLAB_SESSIONS ?? '').trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  return Boolean(import.meta.env.DEV)
}

export const COLLAB_SESSIONS_UNAVAILABLE_MESSAGE =
  '실시간 협업 세션은 현재 클라우드에 제공되지 않아요. 로컬에서 API 서버와 함께 실행할 때 사용할 수 있어요.'
