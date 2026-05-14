import { useEffect, useId, useState } from 'react'

export type ItineraryScheduleConfirmPayload = {
  departure: string
  tripStartDate: string
}

type ItineraryScheduleModalProps = {
  open: boolean
  defaultTripStartDate: string
  onClose: () => void
  onConfirm: (payload: ItineraryScheduleConfirmPayload) => void
}

function PinIcon() {
  return (
    <svg className="itineraryModalInputIcon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
      />
    </svg>
  )
}

export function ItineraryScheduleModal({ open, defaultTripStartDate, onClose, onConfirm }: ItineraryScheduleModalProps) {
  const titleId = useId()
  const [departure, setDeparture] = useState('')
  const [tripStartDate, setTripStartDate] = useState(defaultTripStartDate)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDeparture('')
    setTripStartDate(defaultTripStartDate)
    setError(null)
  }, [open, defaultTripStartDate])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleConfirm() {
    const d = departure.trim()
    if (!d) {
      setError('출발지를 입력해 주세요.')
      return
    }
    onConfirm({ departure: d, tripStartDate })
  }

  return (
    <div className="itineraryModalRoot">
      <div className="itineraryModalBackdrop" aria-hidden="true" />
      <div
        className="itineraryModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="itineraryModalTitle">
          출발지 설정 및 여행 시작일 설정
        </h2>
        <div className="itineraryModalDivider" />

        <div className="itineraryModalBody">
          <label className="itineraryModalLabel" htmlFor="itinerary-departure">
            출발지
          </label>
          <div className={`itineraryModalInputWrap ${error ? 'invalid' : ''}`}>
            <PinIcon />
            <input
              id="itinerary-departure"
              className="itineraryModalInput"
              type="text"
              autoComplete="street-address"
              placeholder="출발지 (서버에서 Gemini로 도로명 정리 후 경로를 만듭니다)"
              value={departure}
              onChange={(e) => {
                setDeparture(e.target.value)
                if (error) setError(null)
              }}
            />
          </div>
          {error ? <p className="itineraryModalFieldError">{error}</p> : null}

          <label className="itineraryModalLabel" htmlFor="itinerary-start-date">
            여행 시작일
          </label>
          <input
            id="itinerary-start-date"
            className="itineraryModalDateInput"
            type="date"
            value={tripStartDate}
            onChange={(e) => setTripStartDate(e.target.value)}
          />
        </div>

        <div className="itineraryModalFooter">
          <button type="button" className="itineraryModalBtn itineraryModalBtnGhost" onClick={onClose}>
            취소
          </button>
          <button type="button" className="itineraryModalBtn itineraryModalBtnPrimary" onClick={handleConfirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
