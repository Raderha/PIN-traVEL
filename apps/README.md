# 핀블(PIN-traVEL)

- 팀명: 개발6팀
- 구조: `apps/web`(프론트) + `apps/api`(서버)

## 프로젝트 구조(현 폴더 트리 + 역할)

```
apps/
  api/                      - Node.js(Express) API 서버
    .env.example            - 서버 환경변수 예시
    package.json            - 서버 의존성/스크립트
    src/
      index.js              - API 서버 엔트리(Express + Socket.IO 부팅)
      routes/index.js        - 기능 라우터 마운트
      routes/modules/auth.js - UC1~3 인증 API(회원가입/로그인/로그아웃)
      routes/modules/map.js  - UC4 지도 기반 조회 API(현재는 스텁/주석 상태)
      routes/modules/festivals.js - UC8 축제 달력/기간 조회 API
      routes/modules/itinerary.js - UC5~6 일정 생성/내보내기 API(현재는 스텁/주석 상태)
      routes/modules/sessions.js  - UC7 협업 세션 생성/조회 API
      realtime/socket.js     - UC7 실시간 동기화(Socket.IO)
      security/auth.js       - (MVP) 토큰 인증 미들웨어
      services/itineraryText.js - UC6 파일명/텍스트 구성 로직
      storage/memory.js      - 개발용 인메모리 저장소/샘플 데이터

  web/                      - React + Vite 프론트엔드
    package.json            - 프론트 의존성/스크립트
    vite.config.ts          - Vite 설정
    index.html              - SPA 엔트리 HTML
    src/main.tsx            - React 엔트리
    src/App.tsx             - 임시 메인 화면(현재 템플릿 상태)
    src/index.css           - 전역 스타일
```

## 사용 스택

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express
- Realtime(협업): Socket.IO
- Validation: Zod
- Workspace: npm workspaces

