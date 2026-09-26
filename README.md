# 핀블(PIN-traVEL)

2026 캡스톤디자인 개발 6팀 저장소입니다.

- 팀명: 개발 6팀
- 구성: **npm workspaces** 모노레포 — `apps/web`(프론트) · `apps/api`(백엔드 API)
- 클라우드(1차): S3 + CloudFront + API Gateway + Lambda, MongoDB Atlas, SSM. 재현은 [docs/deploy-aws.md](docs/deploy-aws.md), 실습 완료 기록은 [docs/aws-deploy-report.md](docs/aws-deploy-report.md).

배포된 HTTPS 사이트(서울 `pintravel-prod`): `https://dm0kbipnsg1gx.cloudfront.net`  
(`GET /health` → `{ "ok": true, "service": "pintravel-api" }`)

---

## 저장소 구조

```
PIN-traVEL/
  package.json                 루트 워크스페이스, 공통 npm 스크립트
  docs/
    deploy-aws.md              AWS 재현·운영 가이드
    aws-deploy-report.md       배포 실습 완료 보고서
  infra/aws/                   SAM 템플릿, samconfig, GitHub OIDC
  .github/workflows/
    deploy-aws.yml             main 푸시·수동 실행 시 SAM + 프론트 배포 (OIDC)
  apps/
    api/                       Node.js(Express) REST API + Socket.IO(로컬)
      .env.example
      Makefile                 sam build용 Lambda 패키징
      src/
        app.js                 Express 앱 팩토리 (listen 없음)
        index.js               로컬 HTTP + Socket.IO
        lambda.js              AWS Lambda 핸들러 (REST만)
        config/                로컬 .env / SSM 로드
        routes/modules/        auth, map, festivals, itinerary, schedule, sessions, airecommand
        realtime/socket.js     UC7 실시간 (로컬만)
        storage/mongo.js       MongoDB
        scripts/               TourAPI sync, 서비스 컬렉션 빌드
    web/                       React + TypeScript + Vite
```

---

## 프론트 라우팅·상단바

| 경로 | 페이지 | 상단 UI |
|------|--------|---------|
| `/` | `HomePage` | 전역 네비 없음 · 페이지 안 `HomeLandingHeader` |
| `/calendar` | `FestivalCalendarPage` | 전역 `NavBar` 없음 |
| `/map` | `MapPage` | `MapNavBar` |
| `/mypage` | `MyPage` | 전역 `NavBar` 없음 (페이지 자체 레이아웃) |
| `/login`, `/signup` | `LoginPage`, `SignupPage` | `HomeLandingHeader` |
| 그 외 | `/`로 리다이렉트 | |

지도는 **네이버 지도(Open API)**. 로컬에서 보려면 `apps/web/.env`에:

- **`VITE_X_NCP_APIGW_API_KEY_ID`** — Maps API Gateway 키 ID (Client Secret은 프론트에 넣지 않음; 일정 경로는 API `.env` / SSM)

---

## 기술 스택

| 구분 | 사용 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite, React Router |
| 백엔드 | Node.js(ESM), Express, Zod |
| 실시간 | Socket.IO (로컬 API). 클라우드 1차에는 없음 |
| 데이터 | MongoDB (`storage/mongo.js`). 프로덕션은 Atlas |
| 배포 | AWS SAM, CloudFront, S3, HTTP API, Lambda, SSM |

세션 저장용 Redis는 코드베이스에 없습니다.

---

## 사전 요구 사항

- Node.js 20+ (npm 포함)
- 로컬 또는 원격 **MongoDB** — API에 `MONGODB_URI` 필수

---

## 실행 방법

저장소 루트에서:

1. `npm install`

2. API 환경 변수: `apps/api/.env.example`을 `apps/api/.env`로 복사한 뒤 최소 **`MONGODB_URI`**.  
   (선택) `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_AUTH_SOURCE` — URI에 자격이 없을 때.  
   기타: `PORT`(4000), `WEB_ORIGIN`(`http://localhost:5173`), `JWT_SECRET`, NCP Key ID/Secret, Gemini 키.

3. 지도: `apps/web/.env`에 `VITE_X_NCP_APIGW_API_KEY_ID`.

4. 개발 서버  
   - API: `npm run dev:api` → `http://localhost:4000` (`GET /health`)  
   - 웹: `npm run dev:web` → `http://localhost:5173` (Vite가 `/api`, `/socket.io`를 API로 프록시)

---

## AWS 배포

서버리스 1차(REST: 인증, 지도, 축제, 일정, 마이페이지)는 배포·검증까지 완료했습니다. Socket.IO 협업(UC7)은 Lambda와 맞지 않아 **클라우드에 포함하지 않습니다.** 로컬 `npm run dev:api`에서는 기존처럼 동작합니다.

- 재현 절차: [docs/deploy-aws.md](docs/deploy-aws.md)
- 계획 대비 이슈·검증: [docs/aws-deploy-report.md](docs/aws-deploy-report.md)
- 인프라: [infra/aws/template.yaml](infra/aws/template.yaml) (`sam build` / `sam deploy`)
- GitHub Actions: [`.github/workflows/deploy-aws.yml`](.github/workflows/deploy-aws.yml) — 시크릿 `AWS_ROLE_ARN`, `VITE_X_NCP_APIGW_API_KEY_ID`. OIDC 역할은 아직 안 켠 경우 수동 배포와 동일하게 `sam deploy` + S3 sync.

프로덕션 시크릿은 Git이 아니라 **SSM** `/pintravel/prod/*` 입니다.

---

## npm 스크립트 (루트)

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | api + web (환경에 따라 `&` 동작이 다를 수 있음) |
| `npm run dev:api` | `@pintravel/api`만 |
| `npm run dev:web` | `web`만 |
| `npm run lint` | 워크스페이스 lint |

API: `apps/api`에서 `npm run sync:tourapi:raw`, `npm run sync:busan:hotel-food` 등 (`package.json` 참고).
