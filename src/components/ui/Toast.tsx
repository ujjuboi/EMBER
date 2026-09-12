import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  message: string | null
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: Props) {
  return (
    <AnimatePresence>
      {message ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          onClick={onDismiss}
          className="fixed left-1/2 z-50 w-[min(92%,380px)] -translate-x-1/2 rounded-lg border border-orange/40 bg-surface px-4 py-3 text-left text-sm text-ink shadow-[0_0_24px_rgb(255_90_31_/_18%)]"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          {message}
        </motion.button>
      ) : null}
    </AnimatePresence>
  )
}
