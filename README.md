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

          index.js          - `/api/*` 기능 라우터 등록

          modules/

            auth.js          - UC1~3 인증(회원가입·로그인·로그아웃 등)

            airecommand.js   - AI 추천 등 `/api/airecommand`

            map.js           - UC4 지도 관련 조회 등 `/api/map`

            festivals.js     - UC8 축제·기간 등 `/api/festivals`

            itinerary.js     - UC5~6 일정 생성·내보내기 등 `/api/itinerary`

            sessions.js      - UC7 협업 세션 등 `/api/sessions`

        realtime/

          socket.js         - UC7 실시간 동기화(Socket.IO)

        security/

          auth.js           - Bearer 토큰 등 검증

          passwords.js      - 비밀번호 scrypt 해시/검증

        services/

          itineraryText.js  - UC6 파일명·텍스트 구성

        storage/

          mongo.js          - MongoDB 연결

          memory.js         - 개발용 인메모리 저장소·샘플 데이터

        scripts/

          syncTourApiRaw.js 

          buildServiceCollections.js

          syncBusanHotelFood.js

    web/                    - React + TypeScript + Vite

      package.json          - 패키지명: web

      vite.config.ts

      index.html

      src/

        main.tsx

        App.tsx             - 라우팅·경로별 상단바(MapNavBar / NavBar / 랜딩 헤더 래퍼)

        pages/               - HomePage, FestivalCalendarPage, MapPage, LoginPage, SignupPage

        components/

          NavBar.tsx         - 일반 페이지용 네비

          HomeLandingHeader.tsx - 랜딩형 상단 메뉴(홈 페이지 본문·로그인/회원가입 상단에 사용)

        lib/

          api.ts             - API 클라이언트 헬퍼

          clearPintravelStorage.ts

        assets/              - 아이콘·히어로·핀 등 이미지 자산

        index.css, App.css

```



## 프론트 라우팅·상단바



| 경로 | 페이지 | 상단 UI |

|------|--------|---------|

| `/` | `HomePage` | 앱 레이아웃의 `NavBar` 없음 · 페이지 안에 `HomeLandingHeader` 포함 |

| `/calendar` | `FestivalCalendarPage` | 전역 `NavBar` 미사용(페이지 자체 레이아웃) |

| `/map` | `MapPage` | `MapNavBar` |

| `/login`, `/signup` | `LoginPage`, `SignupPage` | `HomeLandingHeader`가 감싸는 형태 |

| 그 외 | 리다이렉트(`/`) 등 | 현재 라우트 집합에서는 `NavBar`가 필요한 다른 경로는 없음 |



지도 페이지는 **네이버 지도(Open API)** 를 쓰며, 워크스페이스 루트나 `apps/web`에 다음 환경 변수를 두면 됩니다.



- **`VITE_X_NCP_APIGW_API_KEY_ID`** — NCloud Maps API Gateway 키 ID



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



3. 웹(선택)·지도  

   로컬에서 지도 기능을 보려면 `apps/web/.env`(또는 루트에서 Vite가 읽는 위치)에 `VITE_X_NCP_APIGW_API_KEY_ID` 설정



4. 개발 서버  

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


