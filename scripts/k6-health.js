import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  vus: 2,
  duration: '90s',
}

const BASE = __ENV.BASE_URL || 'https://dm0kbipnsg1gx.cloudfront.net'

export default function () {
  const res = http.get(`${BASE}/health`)
  check(res, {
    'status is 200': (r) => r.status === 200,
  })
  sleep(1)
}
