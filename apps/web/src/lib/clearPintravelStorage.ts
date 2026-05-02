const STORAGE_KEY_PREFIX = 'pintravel_'

function removePrefixedKeys(store: Storage) {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i)
    if (k?.startsWith(STORAGE_KEY_PREFIX)) keys.push(k)
  }
  for (const k of keys) store.removeItem(k)
}

/** 로그아웃 등: 토큰·유저·지도 장바구니 등 `pintravel_*` 클라이언트 저장값 제거 */
export function clearPintravelClientStorage() {
  if (typeof window === 'undefined') return
  removePrefixedKeys(window.localStorage)
  removePrefixedKeys(window.sessionStorage)
}
