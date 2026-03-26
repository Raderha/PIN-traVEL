/**
 * 담당 유스케이스: UC6(여행 일정 텍스트 파일 생성)
 * 역할: 일정 데이터 기반 텍스트 구성 및 다운로드용 파일명 생성 유틸
 */
export function makeItineraryFilename({ username, startDate }) {
  // 예시: 핀블_user01_여행일정_2026-06-01.txt
  return `핀블_${username}_여행일정_${startDate}.txt`;
}

export function buildItineraryText({ itinerary, username }) {
  const lines = [];
  lines.push(`핀블(PIN-traVEL) 여행 일정`);
  lines.push(`사용자: ${username}`);
  lines.push(`생성시각: ${new Date().toISOString()}`);
  lines.push("");

  if (!itinerary || !itinerary.stops) {
    lines.push("일정 데이터가 없습니다.");
    return lines.join("\n");
  }

  lines.push(`출발지: ${itinerary.startLocation ?? "-"}`);
  lines.push(`시작일: ${itinerary.startDate ?? "-"}`);
  lines.push(`이동수단: ${itinerary.transport ?? "-"}`);
  lines.push("");
  lines.push("방문 일정:");

  for (const stop of itinerary.stops) {
    lines.push(`- (${stop.order ?? "?"}) ${stop.name ?? stop.placeId ?? "-"}`);
  }

  lines.push("");
  lines.push("※ 이동 거리/시간/비용 및 AI 서술형 텍스트는 추후 연동 예정");
  return lines.join("\n");
}

