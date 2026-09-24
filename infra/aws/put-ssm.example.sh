#!/usr/bin/env bash
# 예시: 값을 채운 뒤 한 번 실행. 커밋하지 말 것.
#   export AWS_REGION=ap-northeast-2
#   PREFIX=/pintravel/prod
set -euo pipefail
PREFIX="${PREFIX:-/pintravel/prod}"
REGION="${AWS_REGION:-ap-northeast-2}"

put() {
  local name="$1"
  local value="$2"
  aws ssm put-parameter \
    --region "$REGION" \
    --name "${PREFIX}/${name}" \
    --type SecureString \
    --value "$value" \
    --overwrite
}

put MONGODB_URI "mongodb+srv://USER:PASS@CLUSTER/pintravel"
put JWT_SECRET "replace-with-long-random"
put NCP_APIGW_API_KEY_ID "ncp-key-id"
put NCP_APIGW_API_KEY "ncp-secret"
put GEMINI_API_KEY "optional-or-placeholder"
# Optional String (not secret): GEMINI_MODEL, WEB_ORIGIN
# aws ssm put-parameter --name "${PREFIX}/GEMINI_MODEL" --type String --value "gemini-2.5-flash" --overwrite
