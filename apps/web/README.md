# `web` (Vite + React)

핀블 프론트엔드 패키지입니다. 라우팅·실행·환경 변수는 저장소 루트 **[README.md](../../README.md)** 를 따릅니다.

- 개발: 루트에서 `npm run dev:web` (`http://localhost:5173`). `/api`, `/socket.io`는 Vite가 `apps/api`(기본 4000)로 프록시합니다.
- 지도 Key ID: `apps/web/.env`의 `VITE_X_NCP_APIGW_API_KEY_ID` (Secret은 프론트에 두지 않음).
- 프로덕션: `npm run build -w web` → S3. CloudFront가 `/`는 정적 파일, `/api`와 `/health`는 Lambda로 넘깁니다.

Vite 템플릿·ESLint 확장 설명은 [공식 문서](https://vite.dev/guide/)를 참고하세요.
