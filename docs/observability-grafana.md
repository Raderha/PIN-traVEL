# 모니터링 실습 보고서 — Grafana + CloudWatch

- 일자: 2026-11-01 ~ 2026-11-02
- 대상 사이트: `https://dm0kbipnsg1gx.cloudfront.net`
- 스택: `pintravel-prod` · 리전 `ap-northeast-2`
- 목적: 이미 배포된 PIN-traVEL의 호출 수·지연·오류를 Grafana 한 화면에서 보고, 이상 시 메일로 알리기

인프라 구축 기록은 [aws-deploy-report.md](./aws-deploy-report.md), 이 실습의 완료 기록은 [observability-grafana-report.md](./observability-grafana-report.md)를 참고하시면 됩니다. 이 문서는 **운영을 위한 보는 눈**을 만드는 절차입니다.

---

## 사전 준비

아래를 마친 뒤에 Grafana 연결부터 진행하시면 됩니다.

### PC에 설치

1. **Docker Desktop**  
   Grafana를 컨테이너로 실행합니다. 설치 후 Docker가 실행 중인지 확인합니다.
2. **AWS CLI**  
   배포 때 쓰던 CLI와 동일합니다. `aws sts get-caller-identity`로 로그인을 확인합니다. 리전은 `ap-northeast-2`입니다.
3. **k6** (부하 확인용)  
   Windows는 `winget install k6 --source winget` 또는 [k6 설치 문서](https://grafana.com/docs/k6/latest/set-up/install-k6/)를 따릅니다. `k6 version`이 나오면 됩니다.

Grafana OSS는 Docker 이미지로 받으므로, 설치 프로그램으로 Grafana를 따로 깔 필요는 없습니다.

### AWS에서 미리 할 일

1. 배포용 관리자 계정으로 콘솔에 들어갑니다. Grafana에는 이 키를 넣지 않습니다.
2. **읽기 전용 IAM 사용자**를 만듭니다. 예: `pintravel-grafana-read`.  
   CloudWatch 지표 조회 권한만 부여합니다. (`GetMetricData`, `ListMetrics` 등. 로그 패널을 쓸 때만 Logs 읽기를 추가합니다.)
3. 해당 사용자의 **액세스 키**를 발급합니다. Git·채팅에 붙여 넣지 않습니다.
4. 알람용 **이메일**을 쓸 SNS 구독에 쓸 주소를 정해 둡니다. (실습 7단계에서 토픽을 만듭니다.)
5. 대상 리소스 이름을 적어 둡니다.  
   - Lambda: `aws lambda list-functions --region ap-northeast-2`  
   - CloudFront 배포 ID: 스택 `pintravel-prod` Output `DistributionId`  
   - HTTP API ID: 스택 Output 또는 API Gateway 콘솔

### 확인하면 좋은 것

- CloudFront URL의 `/health`가 `{ "ok": true, ... }`를 반환하는지
- Billing 예산 알람이 켜져 있는지 (k6 호출은 소액이 발생할 수 있습니다)

---

## 실습 범위

- 포함: Docker Grafana, CloudWatch 데이터소스, Lambda·API 지표 대시보드, k6로 `/health` 부하, SSM을 잠깐 틀어 에러 재현 후 **즉시 원복**, CloudWatch 알람 + 이메일
- 제외: Atlas 내부 메트릭, X-Ray 전면 도입, Grafana Cloud 유료 워크스페이스, 일정 생성 API에 k6 부하

---

## 실습 순서 (사전 준비 이후)

### 1. Grafana 실행

Docker Desktop이 켜진 상태에서:

```powershell
cd c:\pintravel\infra\observability
docker compose up -d
```

브라우저에서 `http://localhost:3000` → 최초 계정 `admin` / `admin` → 비밀번호를 로컬용으로 바꿉니다.

### 2. CloudWatch 데이터소스

Connections → Data sources → Add → **CloudWatch**.

- Authentication: Access & secret key (`pintravel-grafana-read` 키)
- Default Region: `ap-northeast-2`
- Save & test 가 성공해야 합니다.

### 3. 대시보드 패널

Lambda 함수 이름은 `aws lambda list-functions --region ap-northeast-2`로 확인합니다.

- `AWS/Lambda` `Invocations`, `Duration`, `Errors` (Dimension: FunctionName)
- HTTP API `4xx` / `5xx` (네임스페이스·ApiId는 콘솔에서 확인)

### 4. k6

```powershell
cd c:\pintravel
k6 run scripts\k6-health.js
```

CloudWatch 지표는 1분 단위이므로 1~3분 뒤 그래프를 봅니다. `/health`만 보냅니다.

### 5~7. 장애 재현·알람·문서 보완

SSM을 잠깐 틀었다가 **반드시 원복**한 뒤 Lambda를 재시작합니다. 이어서 Errors 알람과 SNS 이메일을 설정합니다.

---

## 결과

완료. 검증·캡처·시각 대조는 [observability-grafana-report.md](./observability-grafana-report.md)에 정리했습니다.

- Grafana 대시보드 PIN-traVEL: CloudWatch 연결, Invocations·Duration·4xx·5xx
- k6 `/health` 후 Invocations 상승, 오류 ≈ 0
- SSM `MONGODB_URI` 오설정 → `/health` 500 → API 5xx 그래프 → 즉시 원복
- 알람 `pintravel-prod-api-5xx` + SNS 메일, 실제 장애 시각 15:49 KST (= 06:49 UTC)
