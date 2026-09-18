// Skeleton retargeting for the SVG coach (scripts/skeleton.mjs)
//
// Raw pose-estimation keypoints are too noisy to animate directly: occluded
// joints jump to garbage positions, bone lengths stretch between frames, and
// figures wander off-canvas. This module maps BlazePose/MoveNet detections onto
// a fixed, human-proportioned 2D skeleton (kinematic chain rooted at the hips):
//
//   1. Gate each joint on per-keypoint visibility and fill occluded gaps by
//      interpolation/hold across the clip.
//   2. Derive *fixed* bone lengths from the median measured length of each bone;
//      left/right pairs share one length so the figure stays symmetric.
//   3. Rebuild every frame by forward kinematics — measured 2D joint directions
//      drive the chain, fixed lengths keep limbs from stretching ("rubber hose").
//   4. Scale to the 200×260 viewBox, center on the stance, ground the feet on
//      the floor line, mirror by facing, and clamp everything in-bounds.
//
// Outputs frames matching the `Pose` shape in src/coach/poses.ts, so the runtime
// interpolator and CoachAvatar are untouched.

export const VIEWBOX_W = 200
export const VIEWBOX_H = 260
export const FLOOR_Y = 232

const CLAMP_X_MIN = 14
const CLAMP_X_MAX = VIEWBOX_W - 14
const CLAMP_Y_MIN = 8
const CLAMP_Y_MAX = 252

// A joint below this visibility is treated as occluded (filled/interpolated).
const VIS_MIN = 0.5
// Longest occluded run (in frames) bridged by linear interpolation; longer runs
// hold the last good position instead of creating phantom limbs.
const MAX_GAP = 14
// The hip→neck + hip→ankle chain length we aim for in viewBox units. Matches the
// hand-tuned `idle` proportions (~7.5 heads) so extracted loops read the same.
const TARGET_CHAIN = 172
const SCALE_MIN = 0.55
const SCALE_MAX = 1.5

// Joints the coach consumes (poses.ts Pose) plus the extra landmarks BlazePose
// gives us for facing/grounding.
export const CORE_KEYS = [
  'nose',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
]
// Present in BlazePose only; used to refine ground contact when available.
const FOOT_KEYS = ['left_heel', 'right_heel', 'left_foot_index', 'right_foot_index']

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
const add = (a, d) => ({ x: a.x + d.x, y: a.y + d.y })
const scale = (v, n) => ({ x: v.x * n, y: v.y * n })

function unit(a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const m = Math.hypot(dx, dy)
  if (m < 0.0001) return null
  return { x: dx / m, y: dy / m }
}

function perp(v, left) {
  return left ? { x: -v.y, y: v.x } : { x: v.y, y: -v.x }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) return 0
  const h = Math.floor(n / 2)
  return n % 2 ? sorted[h] : (sorted[h - 1] + sorted[h]) / 2
}

// Fill a per-frame array of points (null = occluded) across time: bridge short
// interior gaps by linear interpolation, then hold values at the edges. Returns
// null when the joint is never visible (caller treats that as fatal for the
// exercise, or optional in the case of foot landmarks).
function fillSeries(src) {
  const n = src.length
  let allNull = true
  for (let i = 0; i < n; i += 1) {
    if (src[i] !== null) {
      allNull = false
      break
    }
  }
  if (allNull) return null
  const out = [...src]
  let i = 0
  while (i < n) {
    if (out[i] === null) {
      let j = i
      while (j < n && out[j] === null) j += 1
      const run = j - i
      const a = out[i - 1]
      const b = out[j]
      if (a && b && run <= MAX_GAP) {
        for (let k = i; k < j; k += 1) {
          const t = (k - i + 1) / (run + 1)
          out[k] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
        }
      }
      i = j
    } else {
      i += 1
    }
  }
  // Hold the nearest good value at the leading/trailing edges.
  let last = null
  for (let k = 0; k < n; k += 1) {
    if (out[k] === null) out[k] = last
    else last = out[k]
  }
  last = null
  for (let k = n - 1; k >= 0; k -= 1) {
    if (out[k] === null) out[k] = last
    else last = out[k]
  }
  return out
}

function jointVisibility(detection, key) {
  const kp = detection?.keypoints?.[key]
  if (!kp) return 0
  return kp.visibility ?? kp.score ?? 1
}

/**
 * Turn per-frame detections into temporally-complete keypoint sets.
 *
 * detections: array of { keypoints: Record<name, {x,y,visibility}> } | null
 * Returns [{ pts, meanVis }] or null when a core joint is never visible.
 */
export function fillDetections(detections) {
  const keys = [...CORE_KEYS, ...FOOT_KEYS]
  const series = {}
  for (const key of keys) {
    const raw = detections.map((d) => {
      const kp = d?.keypoints?.[key]
      if (!kp || kp.x == null || kp.y == null) return null
      return (kp.visibility ?? kp.score ?? 1) >= VIS_MIN ? { x: kp.x, y: kp.y } : null
    })
    const filled = fillSeries(raw)
    if (filled === null && CORE_KEYS.includes(key)) return null
    series[key] = filled
  }

  const frames = []
  for (let i = 0; i < detections.length; i += 1) {
    const pts = {}
    let visSum = 0
    for (const key of CORE_KEYS) {
      const p = series[key][i]
      if (!p) return null
      pts[key] = p
      visSum += jointVisibility(detections[i], key)
    }
    for (const key of FOOT_KEYS) {
      if (series[key]) pts[key] = series[key][i]
    }
    frames.push({ pts, meanVis: visSum / CORE_KEYS.length })
  }
  return frames
}

export function detectView(pts) {
  const s = mid(pts.left_shoulder, pts.right_shoulder)
  const h = mid(pts.left_hip, pts.right_hip)
  const torsoH = Math.hypot(h.x - s.x, h.y - s.y) || 1
  const spread = Math.max(
    Math.abs(pts.left_shoulder.x - pts.right_shoulder.x),
    Math.abs(pts.left_hip.x - pts.right_hip.x),
  )
  return spread / torsoH > 0.5 ? 'front' : 'side'
}

export function detectFacing(pts) {
  const s = mid(pts.left_shoulder, pts.right_shoulder)
  const nose = pts.nose
  if (!nose) return null
  return nose.x < s.x ? 'left' : 'right'
}

function computeLimbLengths(frames) {
  const sample = (fn) => frames.map(fn)
  const chain = {
    torso: sample((f) => dist(mid(f.pts.left_hip, f.pts.right_hip), mid(f.pts.left_shoulder, f.pts.right_shoulder))),
    head: sample((f) => Math.min(dist(mid(f.pts.left_shoulder, f.pts.right_shoulder), f.pts.nose), 60)),
    shL: sample((f) => dist(mid(f.pts.left_shoulder, f.pts.right_shoulder), f.pts.left_shoulder)),
    shR: sample((f) => dist(mid(f.pts.left_shoulder, f.pts.right_shoulder), f.pts.right_shoulder)),
    hipL: sample((f) => dist(mid(f.pts.left_hip, f.pts.right_hip), f.pts.left_hip)),
    hipR: sample((f) => dist(mid(f.pts.left_hip, f.pts.right_hip), f.pts.right_hip)),
  }
  const arms = frames.flatMap((f) => [
    dist(f.pts.left_shoulder, f.pts.left_elbow),
    dist(f.pts.right_shoulder, f.pts.right_elbow),
  ])
  const forearms = frames.flatMap((f) => [
    dist(f.pts.left_elbow, f.pts.left_wrist),
    dist(f.pts.right_elbow, f.pts.right_wrist),
  ])
  const thighs = frames.flatMap((f) => [
    dist(f.pts.left_hip, f.pts.left_knee),
    dist(f.pts.right_hip, f.pts.right_knee),
  ])
  const shins = frames.flatMap((f) => [
    dist(f.pts.left_knee, f.pts.left_ankle),
    dist(f.pts.right_knee, f.pts.right_ankle),
  ])
  return {
    torso: median(chain.torso),
    head: median(chain.head),
    shL: median(chain.shL),
    shR: median(chain.shR),
    hipL: median(chain.hipL),
    hipR: median(chain.hipR),
    upperArm: median(arms),
    forearm: median(forearms),
    thigh: median(thighs),
    shin: median(shins),
  }
}

function buildPose(pts, L) {
  const hip = mid(pts.left_hip, pts.right_hip)
  const shoulderMid = mid(pts.left_shoulder, pts.right_shoulder)
  const torsoD = unit(hip, shoulderMid) ?? { x: 0, y: -1 }
  const headD = unit(shoulderMid, pts.nose) ?? torsoD
  const shL = unit(shoulderMid, pts.left_shoulder) ?? perp(torsoD, true)
  const shR = unit(shoulderMid, pts.right_shoulder) ?? perp(torsoD, false)
  const hipL = unit(hip, pts.left_hip) ?? perp(torsoD, true)
  const hipR = unit(hip, pts.right_hip) ?? perp(torsoD, false)
  const ulL = unit(pts.left_shoulder, pts.left_elbow) ?? { x: 0, y: 1 }
  const ulR = unit(pts.right_shoulder, pts.right_elbow) ?? { x: 0, y: 1 }
  const faL = unit(pts.left_elbow, pts.left_wrist) ?? { x: 0, y: 1 }
  const faR = unit(pts.right_elbow, pts.right_wrist) ?? { x: 0, y: 1 }
  const thL = unit(pts.left_hip, pts.left_knee) ?? { x: 0, y: 1 }
  const thR = unit(pts.right_hip, pts.right_knee) ?? { x: 0, y: 1 }
  const shLg = unit(pts.left_knee, pts.left_ankle) ?? { x: 0, y: 1 }
  const shRg = unit(pts.right_knee, pts.right_ankle) ?? { x: 0, y: 1 }

  const neck = add(hip, scale(torsoD, L.torso))
  const head = add(neck, scale(headD, Math.max(10, L.head)))
  const lShoulder = add(neck, scale(shL, L.shL))
  const rShoulder = add(neck, scale(shR, L.shR))
  const lElbow = add(lShoulder, scale(ulL, L.upperArm))
  const rElbow = add(rShoulder, scale(ulR, L.upperArm))
  const lWrist = add(lElbow, scale(faL, L.forearm))
  const rWrist = add(rElbow, scale(faR, L.forearm))
  const lHip = add(hip, scale(hipL, L.hipL))
  const rHip = add(hip, scale(hipR, L.hipR))
  const lKnee = add(lHip, scale(thL, L.thigh))
  const rKnee = add(rHip, scale(thR, L.thigh))
  const lAnkle = add(lKnee, scale(shLg, L.shin))
  const rAnkle = add(rKnee, scale(shRg, L.shin))

  return { view: 'side', head, neck, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, hip, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle }
}

function clampPose(pose) {
  let clamped = 0
  for (const [key, value] of Object.entries(pose)) {
    if (key === 'view') continue
    const x = Math.min(CLAMP_X_MAX, Math.max(CLAMP_X_MIN, value.x))
    const y = Math.min(CLAMP_Y_MAX, Math.max(CLAMP_Y_MIN, value.y))
    if (x !== value.x || y !== value.y) clamped += 1
    pose[key] = { x, y }
  }
  return { pose, clamped }
}

const poseBounds = (pose) => {
  const joints = Object.entries(pose).filter(([key]) => key !== 'view').map(([, v]) => v)
  return {
    minX: Math.min(...joints.map((p) => p.x)),
    maxX: Math.max(...joints.map((p) => p.x)),
    minY: Math.min(...joints.map((p) => p.y)),
    maxY: Math.max(...joints.map((p) => p.y)),
  }
}

/**
 * Retarget filled detections onto the fixed skeleton.
 *
 * Returns { view, facing, frames: [{ frame: Pose, clamped }], meanVis } or null
 * when the clip has nothing usable.
 */
export function buildRetargeted(frames) {
  if (!frames || frames.length < 2) return null

  const anchor = frames.reduce((a, b) => (a.meanVis >= b.meanVis ? a : b))
  const view = detectView(anchor.pts)
  const facing = view === 'side' ? detectFacing(anchor.pts) : null

  // Posture mode decides how the figure contacts the floor line:
  //   lying   — torso roughly horizontal (sit-up, crunch, plank, bench) → the
  //             LOWEST joint rests on the floor.
  //   hanging — torso vertical but feet never reach the floor (pull-up, knee
  //             raises) → never pushed down, keeps the sway below the bar.
  //   planted — torso vertical, feet near the floor most of the time (stand,
  //             lunge, jump) → anchored so feet sit on the floor on average.
  const torsoDir = unit(
    mid(anchor.pts.left_hip, anchor.pts.right_hip),
    mid(anchor.pts.left_shoulder, anchor.pts.right_shoulder),
  ) ?? { x: 0, y: -1 }
  const lying = Math.abs(torsoDir.x) > Math.abs(torsoDir.y)

  const measured = computeLimbLengths(frames)
  const chainLen = measured.torso + measured.thigh + measured.shin || 1
  const scaleFactor = Math.min(SCALE_MAX, Math.max(SCALE_MIN, TARGET_CHAIN / chainLen))
  const L = {
    torso: measured.torso * scaleFactor,
    head: measured.head * scaleFactor,
    shL: measured.shL * scaleFactor,
    shR: measured.shR * scaleFactor,
    hipL: measured.hipL * scaleFactor,
    hipR: measured.hipR * scaleFactor,
    upperArm: measured.upperArm * scaleFactor,
    forearm: measured.forearm * scaleFactor,
    thigh: measured.thigh * scaleFactor,
    shin: measured.shin * scaleFactor,
  }

  const built = frames.map((f) => {
    let pose = buildPose(f.pts, L)
    if (facing === 'left') {
      for (const [key, value] of Object.entries(pose)) {
        if (key === 'view') continue
        pose[key] = { x: VIEWBOX_W - value.x, y: value.y }
      }
    }
    return { f, pose }
  })

  // Vertical postures: median distance of the feet above the floor, used to tell
  // planted/jumping exercises from dangling (pull-up, knee-raise) ones.
  let medianGap = 0
  if (!lying) {
    const footGaps = built.map(({ pose }) => FLOOR_Y - Math.min(pose.lAnkle.y, pose.rAnkle.y))
    medianGap = median(footGaps)
    if (medianGap < 60) {
      // Planted: anchor the clip so feet sit on the floor on average, preserving
      // per-frame relative motion (hop frames stay airborne).
      for (const { pose } of built) {
        for (const [key, value] of Object.entries(pose)) {
          if (key === 'view') continue
          pose[key] = { x: value.x, y: value.y + medianGap }
        }
      }
    }
  }

  let meanVis = 0
  const rebuilt = built.map(({ f, pose }) => {
    meanVis += f.meanVis
    const bounds = poseBounds(pose)
    // Center the figure on its own bounding box.
    const shiftX = VIEWBOX_W / 2 - (bounds.minX + bounds.maxX) / 2
    let shiftY = 0
    if (lying) {
      // Rest the lowest point on the floor: the supporting end (hips, feet,
      // hands) stays planted while the other end lifts away (sit-up, leg-raise,
      // plank, glute bridge all keep their stationary end as the lowest joint).
      shiftY = FLOOR_Y - bounds.maxY
    } else if (medianGap >= 60) {
      // Dangling (pull-up): pull the feet up to the floor only when below it.
      const minFoot = Math.min(pose.lAnkle.y, pose.rAnkle.y)
      shiftY = Math.min(FLOOR_Y - minFoot, 0)
    }
    for (const [key, value] of Object.entries(pose)) {
      if (key === 'view') continue
      pose[key] = { x: value.x + shiftX, y: value.y + shiftY }
    }
    const { pose: frame, clamped } = clampPose(pose)
    return { frame, clamped }
  })

  return {
    view,
    facing,
    frames: rebuilt,
    meanVis: meanVis / frames.length,
  }
}

/**
 * Gate a retargeted clip for minimal quality. Returns a reason string, or null
 * when the clip is acceptable (>=2 in-bounds frames, bounded oversized-clamp,
 * decent confidence).
 */
export function sanityCheck(clip) {
  if (!clip || clip.frames.length < 2) return 'pose-unstable'
  const inBounds = clip.frames.filter(({ frame }) =>
    Object.entries(frame).every(([key, value]) => key === 'view' || (value.x >= 0 && value.x <= VIEWBOX_W && value.y >= 0 && value.y <= VIEWBOX_H)),
  )
  if (inBounds.length < 2) return 'out-of-bounds'
  const badlyClamped = clip.frames.filter(({ clamped }) => clamped > 6)
  if (badlyClamped.length > Math.max(1, clip.frames.length / 2)) return 'oversized'
  if (clip.meanVis < 0.4) return 'low-confidence'
  return null
}