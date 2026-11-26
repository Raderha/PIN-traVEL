# AWS 계정 보안 이상 징후 대응 보고서

**작성일**: 2026-11-26  
**관련 프로젝트**: PIN-traVEL  
**대상 리전**: ap-northeast-2 (서울) 및 us-east-1

---

## 1. 개요

2026년 11월 25일~26일, CloudTrail 로그에서 정상적인 운영 패턴과 다른 API 호출이 감지되어 보안 점검을 진행하고 즉시 대응 조치를 수행하였다.

본 보고서는 이상 징후 탐지부터 조치 완료까지의 과정을 기록한다.

---

## 2. 탐지 경위

- IAM 사용자 `pintravel-grafana-read` (CloudWatch 읽기 전용 권한)의 Access Key에서  
  EC2 및 Bedrock 관련 API 호출이 기록됨을 확인
- 동일 시간대에 관리자 권한 사용자 `TEST_PINVEL`에서도 유사한 호출이 발생
- 호출된 API 중 일부는 권한이 없어 `AccessDenied` / `UnauthorizedOperation`으로 실패
- 평소 사용하지 않는 리전에서의 호출이 포함되어 있어 이상 징후로 판단

---

## 3. 즉시 조치 사항

| 순서 | 조치 내용 | 상태 |
|------|-----------|------|
| 1 | 관련 IAM 사용자 Access Key 전부 비활성화 | 완료 |
| 2 | 루트 계정 비밀번호 변경 | 완료 |
| 3 | 루트 계정 및 주요 IAM 사용자 MFA 설정 확인 | 완료 |
| 4 | 로컬 환경(`~/.aws/credentials`) 자격 증명 제거 | 완료 |
| 5 | GitHub 저장소 및 Git 히스토리에서 시크릿 노출 여부 검증 | 완료 (노출 흔적 없음) |
| 6 | AWS Support에 보안 조치 완료 보고 및 계정 제한 해제 요청 | 완료 |

---

## 4. CloudTrail 분석 요약

- `pintravel-grafana-read` 계정으로 시도된 EC2 / Bedrock 호출은 모두 권한 부족으로 실패
- 실제 리소스 생성·삭제·수정 등 영향이 큰 작업은 확인되지 않음
- 관리자 권한 계정의 Access Key는 즉시 비활성화하여 추가 위험 차단

---

## 5. 사후 점검 및 예방 조치

- 관리자 권한이 있는 Access Key는 평상시 비활성화 상태로 유지
- 모니터링용 IAM 사용자는 최소 권한 원칙을 재확인
- 로컬 개발 환경에 장기 Access Key를 저장하지 않도록 관리
- 향후 필요 시 IAM Role + OIDC 방식 사용을 검토

---

## 6. 결론

이상 징후를 빠르게 감지하고 Access Key를 즉시 비활성화함으로써,  
실제 리소스 피해나 과금 발생을 사전에 차단할 수 있었다.

이번 경험을 통해 CloudTrail 모니터링의 중요성과  
Access Key 관리 및 최소 권한 원칙의 필요성을 다시 한번 확인하였다.

---

**관련 문서**
- [aws-deploy-report.md](./aws-deploy-report.md)
- [observability-grafana-report.md](./observability-grafana-report.md)
