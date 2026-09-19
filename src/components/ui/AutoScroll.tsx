import { useEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
  duration?: number
}

// Single-line text that scrolls (marquee) when it overflows its container,
// truncating with an ellipsis when it fits.
export function AutoScroll({ children, className = '', duration = 12 }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const check = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 1)
    }
    check()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(check)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [children])

  if (!overflow) {
    return (
      <span ref={ref} className={`block whitespace-nowrap ${className} truncate`}>
        {children}
      </span>
    )
  }

  return (
    <span ref={ref} className={`block whitespace-nowrap ${className} overflow-hidden`}>
      <span className="marquee" style={{ animationDuration: `${duration}s` }}>
        <span className="marquee-item">{children}</span>
        <span aria-hidden="true" className="marquee-item">
          {children}
        </span>
      </span>
    </span>
  )
}