/**
 * 출발지 자연어 → 네이버 지도 Geocoding에 넣기 좋은 도로명주소 한 줄로 정리 (Gemini)
 *
 * `@google/genai` SDK 사용. 기본 모델: `gemini-2.5-pro`.
 * `GEMINI_MODEL`로 덮어쓸 수 있음.
 */

import { ApiError, GoogleGenAI } from "@google/genai";

/** GEMINI_MODEL 미설정 시 */
const DEFAULT_FIRST_MODEL = "gemini-2.5-pro";

/** 404·429·빈 응답 시 순서대로 시도 (환경 변수 모델은 buildModelChain에서 맨 앞) */
const MODEL_FALLBACK_CHAIN = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];

function buildModelChain() {
  const env = String(process.env.GEMINI_MODEL ?? "").trim();
  const out = [];
  if (env) out.push(env);
  for (const m of MODEL_FALLBACK_CHAIN) {
    if (m && !out.includes(m)) out.push(m);
  }
  if (!env && !out.includes(DEFAULT_FIRST_MODEL)) {
    out.unshift(DEFAULT_FIRST_MODEL);
  }
  return out.length > 0 ? out : [DEFAULT_FIRST_MODEL];
}

function sanitizeOneLineAddress(raw) {
  if (!raw || typeof raw !== "string") return null;
  let s = raw.replace(/\r\n/g, "\n").split("\n")[0].trim();
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (s.length > 400) s = s.slice(0, 400).trim();
  return s.length > 0 ? s : null;
}

function truncate(s, max) {
  if (s == null || typeof s !== "string") return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function httpStatusFromResponse(response) {
  const st = response?.sdkHttpResponse?.responseInternal?.status;
  return typeof st === "number" ? st : 200;
}

/**
 * @param {*} ai
 * @param {string} place
 * @param {string} modelName
 * @param {AbortSignal} [signal]
 */
async function callGeminiGenerate(ai, place, modelName, signal) {
  const userLiteral = JSON.stringify(place);

  const prompt = `역할: 대한민국 주소 전문가. 아래 [사용자 입력]이 가리키는 **실제 한 곳**에 대응하는 **도로명주소(road address)** 한 줄만 내면 됩니다. 이 문자열은 곧바로 네이버 클라우드 플랫폼 Maps **Geocoding API의 query**에 넣습니다.

[사용자 입력] (그대로 인용, 의미 변경 금지)
${userLiteral}

요구사항:
1) 출력은 **한 줄**이며, **도로명주소 형식**이어야 합니다. (시·도 + 시·군·구 + **도로명 + 건물번호(번지)**.) 지번만·법정동만 단독 출력 금지.
2) **건물번호가 알려진 공식 주소가 있으면 반드시 포함**하세요. 도로명만 끊어서 내면(예: "…해양대학로"처럼 번지 없음) 지오코딩 API가 결과를 못 찾는 경우가 많습니다. 대학·관공서·역·터미널·쇼핑몰 등은 해당 시설 **대표 정문/본관** 기준 공식 도로명+번지를 쓰세요.
3) 반드시 **위 [사용자 입력]과 동일한 장소·시설·지명**을 가리키는 주소여야 합니다. 비슷한 이름의 다른 지역·다른 캠퍼스·다른 출구로 바꾸지 마세요.
4) 애매하면 **그 입력으로 검색했을 때 가장 유력한 단일 후보** 하나만 선택하세요. 여러 후보·번호 매기기·설명 문장·따옴표·괄호 부연 금지.
5) 한국어. 건물명·층은 입력이 특정했을 때만 뒤에 덧붙이고, 없으면 생략.
6) 출력 외 다른 글자(서론, "다음은", JSON, 태그)는 **절대** 쓰지 마세요.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        abortSignal: signal,
        temperature: 0.2,
        maxOutputTokens: 384,
      },
    });

    const geminiHttpStatus = httpStatusFromResponse(response);
    const rawText = typeof response.text === "string" ? response.text.trim() : "";

    if (!Number.isFinite(geminiHttpStatus) || geminiHttpStatus < 200 || geminiHttpStatus >= 300) {
      const snippet = truncate(JSON.stringify({ status: geminiHttpStatus }), 600) ?? "";
      return {
        normalized: null,
        rawModelText: "",
        geminiHttpStatus,
        geminiApiError: `HTTP_${geminiHttpStatus}`,
        geminiResponseSnippet: snippet,
        model: modelName,
      };
    }

    return {
      normalized: sanitizeOneLineAddress(rawText),
      rawModelText: rawText,
      geminiHttpStatus,
      geminiApiError: null,
      geminiResponseSnippet: "",
      model: modelName,
    };
  } catch (e) {
    if (e instanceof ApiError) {
      const snippet =
        truncate(
          JSON.stringify({ status: e.status, message: e.message }),
          600,
        ) ?? "";
      return {
        normalized: null,
        rawModelText: "",
        geminiHttpStatus: e.status,
        geminiApiError: e.message,
        geminiResponseSnippet: snippet,
        model: modelName,
      };
    }
    return {
      normalized: null,
      rawModelText: "",
      geminiHttpStatus: null,
      geminiApiError: String(e?.message ?? e),
      geminiResponseSnippet: "",
      model: modelName,
    };
  }
}

/**
 * @param {string} userPlace
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 */
export async function geminiNormalizeToRoadAddressWithDebug(userPlace, apiKey, signal) {
  const key = String(apiKey ?? "").trim();
  const place = String(userPlace ?? "").trim();
  const chain = buildModelChain();
  const primaryLabel = chain[0] ?? DEFAULT_FIRST_MODEL;

  if (!key || !place) {
    return {
      skipped: true,
      normalized: null,
      rawModelText: "",
      geminiHttpStatus: null,
      geminiApiError: null,
      geminiResponseSnippet: "",
      model: primaryLabel,
      geminiModelsTried: "",
    };
  }

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const tryLog = [];
    /** @type {null | Awaited<ReturnType<typeof callGeminiGenerate>>} */
    let last = null;

    for (const modelName of chain) {
      const r = await callGeminiGenerate(ai, place, modelName, signal);
      last = r;
      const oneLineErr = r.geminiApiError ? truncate(r.geminiApiError, 100) : "";
      tryLog.push(`${modelName}→HTTP${r.geminiHttpStatus ?? "?"}${oneLineErr ? `(${oneLineErr})` : ""}`);

      if (r.geminiHttpStatus === 200 && r.normalized) {
        return {
          skipped: false,
          normalized: r.normalized,
          rawModelText: r.rawModelText,
          geminiHttpStatus: r.geminiHttpStatus,
          geminiApiError: null,
          geminiResponseSnippet: r.geminiResponseSnippet ?? "",
          model: r.model,
          geminiModelsTried: tryLog.join(" | "),
        };
      }

      if (r.geminiHttpStatus === 200) {
        continue;
      }

      if (r.geminiHttpStatus === 404 || r.geminiHttpStatus === 429 || r.geminiHttpStatus === 503) {
        continue;
      }

      break;
    }

    return {
      skipped: false,
      normalized: null,
      rawModelText: "",
      geminiHttpStatus: last?.geminiHttpStatus ?? null,
      geminiApiError: last?.geminiApiError ?? "GEMINI_NO_USABLE_MODEL",
      geminiResponseSnippet: last?.geminiResponseSnippet ?? "",
      model: last?.model ?? primaryLabel,
      geminiModelsTried: tryLog.join(" | "),
    };
  } catch (e) {
    return {
      skipped: false,
      normalized: null,
      rawModelText: "",
      geminiHttpStatus: null,
      geminiApiError: String(e?.message ?? e),
      geminiResponseSnippet: "",
      model: primaryLabel,
      geminiModelsTried: "",
    };
  }
}

/**
 * @param {string} userPlace
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 * @returns {Promise<string | null>}
 */
export async function geminiNormalizeToRoadAddress(userPlace, apiKey, signal) {
  const r = await geminiNormalizeToRoadAddressWithDebug(userPlace, apiKey, signal);
  return r.normalized;
}
