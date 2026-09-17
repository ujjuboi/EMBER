import { Button } from '../../components/ui/Button'
import type { PendingPeer } from '../../lib/types'

export function AcceptPairCard({
  peer,
  onAccept,
  onDecline,
}: {
  peer: PendingPeer
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="mt-4 rounded-lg border border-orange/30 bg-orange/5 px-3 py-3">
      <p className="text-sm font-medium">{peer.name}</p>
      <p className="mt-0.5 text-xs text-muted">
        {peer.email || 'A fellow member'} wants to pair with you
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="line" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  )
}
