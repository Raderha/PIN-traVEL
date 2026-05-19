import type { RemoteCursor } from '../hooks/useCollabSession'

type SessionCursorOverlayProps = {
  cursors: RemoteCursor[]
}

const CURSOR_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777']

function colorForUsername(username: string) {
  let h = 0
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length]
}

export function SessionCursorOverlay({ cursors }: SessionCursorOverlayProps) {
  if (cursors.length === 0) return null

  return (
    <div className="sessionCursorLayer" aria-hidden="true">
      {cursors.map((c) => (
        <div
          key={c.username}
          className="sessionRemoteCursor"
          style={{
            left: `${c.x * 100}%`,
            top: `${c.y * 100}%`,
            ['--cursor-color' as string]: colorForUsername(c.username),
          }}
        >
          <span className="sessionRemoteCursorDot" />
          <span className="sessionRemoteCursorPointer" />
          <span className="sessionRemoteCursorLabel">{c.username}</span>
        </div>
      ))}
    </div>
  )
}
