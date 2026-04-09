# 핀블(PIN-traVEL)

2026 캡스톤디자인 개발 6팀 저장소입니다.

- 팀명: 개발 6팀
- 구성: **npm workspaces** 모노레포 — `apps/web`(프론트) · `apps/api`(백엔드 API)

## 저장소 구조

```
PIN-traVEL/
  package.json              - 루트 워크스페이스, 공통 npm 스크립트
  apps/
    api/                    - Node.js(Express) REST API + Socket.IO
      .env.example          - 서버 환경 변수 예시 (`apps/api/.env`로 복사)
      package.json          - 패키지명: @pintravel/api
      src/
        index.js            - HTTP 서버 부팅, MongoDB 연결, CORS, 라우트/Socket 마운트
        routes/
          index.js          - 기능 라우터 등록
          modules/
            auth.js         - UC1~3 인증(회원가입·로그인·로그아웃)
            map.js          - UC4 지도 기반 조회
            festivals.js    - UC8 축제 달력·기간 조회
            itinerary.js    - UC5~6 일정 생성·내보내기
            sessions.js     - UC7 협업 세션
        realtime/
          socket.js         - UC7 실시간 동기화(Socket.IO)
        security/
          auth.js           - MVP 토큰(Authorization Bearer) 검증
          passwords.js      - 비밀번호 scrypt 해시/검증
        services/
          itineraryText.js  - UC6 파일명·텍스트 구성
        storage/
          mongo.js          - MongoDB 연결
          memory.js         - 개발용 인메모리 저장소·샘플 데이터
        scripts/
          syncTourApiRaw.js
          buildServiceCollections.js
    web/                    - React + Vite + TypeScript
      package.json          - 패키지명: web
      vite.config.ts
      index.html
      src/
        main.tsx
        App.tsx             - React Router 라우팅(홈·캘린더·로그인·회원가입)
        pages/              - HomePage, FestivalCalendarPage, LoginPage, SignupPage
        components/         - NavBar 등
        lib/api.ts          - API 클라이언트 헬퍼
        index.css, App.css
```

## 기술 스택

| 구분 | 사용 |
|------|------|
| 프론트엔드 | React 19, TypeScript, Vite, React Router |
| 백엔드 | Node.js(ESM), Express |
| 검증 | Zod(api) |
| 실시간 | Socket.IO |
| 데이터 | MongoDB(연결: `storage/mongo.js`) |

> 세션 저장용 Redis 등은 코드베이스에 아직 포함되어 있지 않습니다. 필요 시 별도 도입·문서화 예정입니다.

## 사전 요구 사항

- Node.js(npm 포함)
- 로컬 또는 원격 **MongoDB** — API 기동에 `MONGODB_URI` 필수

## 실행 방법

저장소 루트(`PIN-traVEL/`)에서:

1. 의존성 설치  
   `npm install`

2. API 환경 변수  
   `apps/api/.env.example`을 `apps/api/.env`로 복사한 뒤, 최소 **`MONGODB_URI`** 를 설정합니다.  
   (선택) `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `MONGODB_AUTH_SOURCE` — URI에 자격 증명이 없을 때 사용합니다.  
   기타: `PORT`(기본 4000), `WEB_ORIGIN`(기본 `http://localhost:5173`), `JWT_SECRET`(예시 파일 참고)

3. 개발 서버  
   - API만: `npm run dev:api`  
   - 웹만: `npm run dev:web`  

- API 기본 주소: `http://localhost:4000` — 헬스 체크: `GET /health`  
- 웹(Vite) 기본 주소: `http://localhost:5173`

## npm 스크립트 (루트)

| 스크립트 | 설명 |
|----------|------|
| `npm run dev` | api + web 개발 서버(환경에 따라 동작 방식이 다를 수 있음) |
| `npm run dev:api` | `@pintravel/api`만 |
| `npm run dev:web` | `web` 워크스페이스만 |
| `npm run lint` | 워크스페이스 전체 lint |

API 패키지 전용: `apps/api`에서 `npm run sync:tourapi:raw` 등(`package.json` 참고).
