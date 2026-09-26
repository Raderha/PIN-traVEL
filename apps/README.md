# `apps/` 패키지

- `api` — `@pintravel/api` Express API. 로컬은 `src/index.js`(REST + Socket.IO), AWS Lambda는 `src/lambda.js`(REST만).
- `web` — Vite + React. 상세는 [web/README.md](./web/README.md).

폴더 트리, 스택, 로컬 실행, AWS 배포는 **저장소 루트의 [README.md](../README.md)** 와 [docs/deploy-aws.md](../docs/deploy-aws.md)를 기준으로 합니다.
