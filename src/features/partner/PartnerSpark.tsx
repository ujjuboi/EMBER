import { useEffect, useState } from 'react'

const PALETTE: Record<string, string> = {
  '.': 'transparent',
  a: '#FFD8BC',
  b: '#FFB07A',
  c: '#FF8A4A',
  o: '#FF5A1F',
  d: '#D44512',
  e: '#8A280C',
  f: '#4A1206',
}

function pack(rows: string[]) {
  const width = Math.max(...rows.map((row) => row.length))
  return rows.map((row) => row.padEnd(width, '.'))
}

const YOU = pack([
  '....ffffffff....',
  '....faaaaaaf....',
  '....faaaaaaf....',
  '....fabaaaaf....',
  '....faefeaaf....',
  '....faaaaaaf....',
  '....faadddaf....',
  '....ffffffff....',
  '....fdooooodf...',
  'ffffooooooooffff',
  'fffoooooooooffff',
  'fffoooooooooffff',
  'fffooodddoooffff',
  'fffooodddoooffff',
  'fffoooooooooffff',
  'fffoooooooooffff',
  'fffoooooooooffff',
  'fffoooooooooffff',
  'fffffoooooofffff',
  'ffff.oooooo.ffff',
  '....fddddddf....',
  '....fddddddf....',
  '....fddd.dddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....feef.feef...',
  '....feef.feef...',
  '....ffff.ffff...',
  '....ffff.ffff...',
])

const THEM = pack([
  '.....ffffff.....',
  '....ffaaaaff....',
  '...ffaaaaaaff...',
  '...faaaaaaaaf...',
  '...faabaaaaf....',
  '...faefeaaf.....',
  '...faaaaaaaf....',
  '....ffffffff....',
  '....fdooooodf...',
  'ffffddddooooffff',
  'fffddddoooooffff',
  'fffddoooooooffff',
  'fffddooodoooffff',
  'fffddooodoooffff',
  'fffddoooooooffff',
  'fffddoooooooffff',
  'fffddoooooooffff',
  'fffddoooooooffff',
  'ffffddooooofffff',
  'ffff.dooooo.ffff',
  '....fddddddf....',
  '....fddddddf....',
  '....fddd.dddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....fddf.fddf...',
  '....feef.feef...',
  '....feef.feef...',
  '....ffff.ffff...',
  '....ffff.ffff...',
])

const FLAME = [
  pack([
    '......c.......',
    '.....cbc......',
    '....cbabc.....',
    '....cbaac.....',
    '...ccbaacc....',
    '...cbabacc....',
    '..ccbababcc...',
    '..cbbababcc...',
    '..cbbdodcc....',
    '..cbddddcc....',
    '...cddddc.....',
    '....cdddc.....',
    '.....eee......',
    '.....fff......',
  ]),
  pack([
    '.......c......',
    '......cbc.....',
    '.....cbabc....',
    '...cccbaac....',
    '...ccbabcc....',
    '..ccbababcc...',
    '..cbbababcc...',
    '..cbbabobcc...',
    '..cbbdodbcc...',
    '...cbddddc....',
    '...ccdddc.....',
    '....cdddc.....',
    '.....eee......',
    '.....fff......',
  ]),
  pack([
    '......b.......',
    '.....cocc.....',
    '....cbabc.....',
    '...ccbabcc....',
    '...cbabaoc....',
    '..ccbababcc...',
    '..cbbababcc...',
    '..cbbdobbcc...',
    '..ccddddcc....',
    '...cddddc.....',
    '....cdddc.....',
    '....cddcc.....',
    '.....eee......',
    '.....fff......',
  ]),
  pack([
    '.....c.b......',
    '....cbcoc.....',
    '....cbabc.....',
    '...ccbaacc....',
    '..ccbabacc....',
    '..cbbababcc...',
    '..cbbababcc...',
    '...bbdodbcc...',
    '...cbddddc....',
    '...ccdddc.....',
    '....cdddc.....',
    '.....ddc......',
    '.....eee......',
    '.....fff......',
  ]),
]

function PixelSprite({
  rows,
  pixel,
  flip,
  className = '',
}: {
  rows: string[]
  pixel: number
  flip?: boolean
  className?: string
}) {
  const width = rows[0]?.length ?? 0
  const height = rows.length

  return (
    <svg
      width={width * pixel}
      height={height * pixel}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      className={`${flip ? '-scale-x-100' : ''} ${className}`}
      aria-hidden
    >
      {rows.flatMap((row, y) =>
        [...row].map((cell, x) => {
          const fill = PALETTE[cell]
          if (!fill || fill === 'transparent') return null
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
        }),
      )}
    </svg>
  )
}

function PixelFlame({ pixel }: { pixel: number }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % FLAME.length)
    }, 140)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="ember-flame mb-2 drop-shadow-[0_0_14px_rgb(255_90_31_/_55%)]">
      <PixelSprite rows={FLAME[frame] ?? FLAME[0]} pixel={pixel} />
    </div>
  )
}

export function PartnerSpark() {
  return (
    <div className="flex items-end justify-center gap-1 py-4" aria-hidden>
      <div className="pixel-bob">
        <PixelSprite rows={YOU} pixel={4} />
      </div>
      <PixelFlame pixel={4} />
      <div className="pixel-bob-delay">
        <PixelSprite rows={THEM} pixel={4} flip />
      </div>
    </div>
  )
}
