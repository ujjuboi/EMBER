export type Joint = { x: number; y: number }

export type Pose = {
  view: 'side' | 'front'
  head: Joint
  neck: Joint
  lShoulder: Joint
  rShoulder: Joint
  lElbow: Joint
  rElbow: Joint
  lWrist: Joint
  rWrist: Joint
  hip: Joint
  lHip: Joint
  rHip: Joint
  lKnee: Joint
  rKnee: Joint
  lAnkle: Joint
  rAnkle: Joint
}

const j = (x: number, y: number): Joint => ({ x, y })

function side(parts: Omit<Pose, 'view'>): Pose {
  return { view: 'side', ...parts }
}

function front(parts: Omit<Pose, 'view'>): Pose {
  return { view: 'front', ...parts }
}

/** Standing profile, facing right. Far limbs = left, near = right. */
export const idle: Pose = side({
  head: j(118, 38),
  neck: j(114, 56),
  lShoulder: j(100, 66),
  rShoulder: j(122, 70),
  lElbow: j(94, 98),
  rElbow: j(128, 102),
  lWrist: j(90, 128),
  rWrist: j(132, 132),
  hip: j(108, 128),
  lHip: j(98, 132),
  rHip: j(118, 132),
  lKnee: j(102, 178),
  rKnee: j(120, 178),
  lAnkle: j(98, 228),
  rAnkle: j(120, 228),
})

const squatReady: Pose = side({
  head: j(110, 54),
  neck: j(108, 72),
  lShoulder: j(94, 84),
  rShoulder: j(116, 88),
  lElbow: j(126, 100),
  rElbow: j(140, 104),
  lWrist: j(148, 106),
  rWrist: j(160, 110),
  hip: j(100, 156),
  lHip: j(92, 158),
  rHip: j(108, 158),
  lKnee: j(124, 190),
  rKnee: j(136, 190),
  lAnkle: j(108, 228),
  rAnkle: j(120, 228),
})

const squatDown: Pose = side({
  head: j(108, 84),
  neck: j(106, 102),
  lShoulder: j(92, 114),
  rShoulder: j(114, 118),
  lElbow: j(130, 122),
  rElbow: j(144, 126),
  lWrist: j(152, 124),
  rWrist: j(164, 128),
  hip: j(94, 178),
  lHip: j(86, 180),
  rHip: j(102, 180),
  lKnee: j(134, 188),
  rKnee: j(146, 188),
  lAnkle: j(108, 228),
  rAnkle: j(120, 228),
})

const jumpExtend: Pose = side({
  head: j(118, 18),
  neck: j(116, 36),
  lShoulder: j(98, 46),
  rShoulder: j(126, 48),
  lElbow: j(78, 28),
  rElbow: j(148, 26),
  lWrist: j(64, 12),
  rWrist: j(162, 10),
  hip: j(110, 108),
  lHip: j(100, 112),
  rHip: j(120, 112),
  lKnee: j(104, 152),
  rKnee: j(122, 150),
  lAnkle: j(100, 188),
  rAnkle: j(122, 186),
})

const hinge: Pose = side({
  head: j(52, 96),
  neck: j(68, 102),
  lShoulder: j(82, 108),
  rShoulder: j(98, 114),
  lElbow: j(70, 138),
  rElbow: j(92, 144),
  lWrist: j(62, 168),
  rWrist: j(86, 174),
  hip: j(112, 132),
  lHip: j(102, 136),
  rHip: j(122, 136),
  lKnee: j(108, 176),
  rKnee: j(126, 176),
  lAnkle: j(100, 228),
  rAnkle: j(122, 228),
})

const hingeReady: Pose = side({
  head: j(86, 62),
  neck: j(94, 78),
  lShoulder: j(96, 88),
  rShoulder: j(112, 94),
  lElbow: j(88, 118),
  rElbow: j(114, 124),
  lWrist: j(82, 148),
  rWrist: j(110, 154),
  hip: j(110, 130),
  lHip: j(100, 134),
  rHip: j(120, 134),
  lKnee: j(106, 176),
  rKnee: j(124, 176),
  lAnkle: j(100, 228),
  rAnkle: j(122, 228),
})

const lungeUp: Pose = side({
  head: j(108, 64),
  neck: j(106, 82),
  lShoulder: j(90, 94),
  rShoulder: j(114, 98),
  lElbow: j(86, 124),
  rElbow: j(120, 128),
  lWrist: j(84, 152),
  rWrist: j(124, 156),
  hip: j(100, 158),
  lHip: j(88, 162),
  rHip: j(114, 156),
  lKnee: j(62, 192),
  rKnee: j(152, 176),
  lAnkle: j(40, 228),
  rAnkle: j(158, 228),
})

const lungeDown: Pose = side({
  head: j(104, 82),
  neck: j(102, 100),
  lShoulder: j(86, 112),
  rShoulder: j(110, 116),
  lElbow: j(82, 142),
  rElbow: j(116, 146),
  lWrist: j(80, 168),
  rWrist: j(120, 172),
  hip: j(96, 174),
  lHip: j(84, 178),
  rHip: j(110, 172),
  lKnee: j(58, 200),
  rKnee: j(156, 178),
  lAnkle: j(40, 228),
  rAnkle: j(158, 228),
})

const stepUp: Pose = side({
  head: j(124, 28),
  neck: j(120, 46),
  lShoulder: j(104, 56),
  rShoulder: j(128, 60),
  lElbow: j(98, 86),
  rElbow: j(134, 90),
  lWrist: j(94, 114),
  rWrist: j(138, 118),
  hip: j(114, 112),
  lHip: j(102, 118),
  rHip: j(126, 116),
  lKnee: j(108, 168),
  rKnee: j(148, 148),
  lAnkle: j(104, 218),
  rAnkle: j(156, 188),
})

const pushHigh: Pose = side({
  head: j(46, 86),
  neck: j(62, 94),
  lShoulder: j(78, 88),
  rShoulder: j(84, 102),
  lElbow: j(72, 114),
  rElbow: j(80, 132),
  lWrist: j(68, 142),
  rWrist: j(78, 158),
  hip: j(124, 96),
  lHip: j(120, 90),
  rHip: j(130, 104),
  lKnee: j(154, 98),
  rKnee: j(162, 112),
  lAnkle: j(182, 104),
  rAnkle: j(188, 120),
})

const pushLow: Pose = side({
  head: j(50, 122),
  neck: j(66, 128),
  lShoulder: j(82, 120),
  rShoulder: j(88, 136),
  lElbow: j(60, 138),
  rElbow: j(68, 156),
  lWrist: j(68, 150),
  rWrist: j(78, 166),
  hip: j(126, 128),
  lHip: j(122, 122),
  rHip: j(132, 136),
  lKnee: j(154, 124),
  rKnee: j(162, 138),
  lAnkle: j(182, 118),
  rAnkle: j(188, 134),
})

const pike: Pose = side({
  head: j(64, 148),
  neck: j(78, 136),
  lShoulder: j(90, 122),
  rShoulder: j(98, 134),
  lElbow: j(78, 148),
  rElbow: j(86, 162),
  lWrist: j(70, 168),
  rWrist: j(80, 182),
  hip: j(128, 72),
  lHip: j(122, 68),
  rHip: j(136, 78),
  lKnee: j(148, 104),
  rKnee: j(158, 116),
  lAnkle: j(168, 138),
  rAnkle: j(176, 152),
})

const pikeDown: Pose = side({
  head: j(52, 176),
  neck: j(68, 160),
  lShoulder: j(86, 140),
  rShoulder: j(94, 152),
  lElbow: j(68, 158),
  rElbow: j(76, 172),
  lWrist: j(70, 168),
  rWrist: j(80, 182),
  hip: j(132, 68),
  lHip: j(126, 64),
  rHip: j(140, 74),
  lKnee: j(150, 100),
  rKnee: j(160, 112),
  lAnkle: j(168, 138),
  rAnkle: j(176, 152),
})

const plankA: Pose = side({
  ...pushHigh,
  hip: j(124, 90),
  lHip: j(120, 84),
  rHip: j(130, 98),
})

const plankB: Pose = side({
  ...pushHigh,
  hip: j(124, 108),
  lHip: j(120, 102),
  rHip: j(130, 116),
})

const sidePlankA: Pose = side({
  head: j(118, 78),
  neck: j(112, 94),
  lShoulder: j(96, 128),
  rShoulder: j(108, 112),
  lElbow: j(90, 156),
  rElbow: j(86, 140),
  lWrist: j(84, 178),
  rWrist: j(72, 162),
  hip: j(132, 128),
  lHip: j(128, 136),
  rHip: j(138, 120),
  lKnee: j(156, 138),
  rKnee: j(164, 122),
  lAnkle: j(178, 144),
  rAnkle: j(186, 128),
})

const sidePlankB: Pose = {
  ...sidePlankA,
  hip: j(132, 118),
  lHip: j(128, 126),
  rHip: j(138, 110),
}

const rowHang: Pose = side({
  head: j(48, 124),
  neck: j(64, 118),
  lShoulder: j(80, 112),
  rShoulder: j(88, 124),
  lElbow: j(86, 88),
  rElbow: j(96, 98),
  lWrist: j(94, 60),
  rWrist: j(104, 70),
  hip: j(128, 132),
  lHip: j(124, 126),
  rHip: j(134, 140),
  lKnee: j(154, 136),
  rKnee: j(162, 150),
  lAnkle: j(178, 142),
  rAnkle: j(186, 156),
})

const rowPull: Pose = side({
  head: j(52, 88),
  neck: j(68, 84),
  lShoulder: j(84, 80),
  rShoulder: j(92, 92),
  lElbow: j(70, 70),
  rElbow: j(80, 80),
  lWrist: j(94, 60),
  rWrist: j(104, 70),
  hip: j(128, 96),
  lHip: j(124, 90),
  rHip: j(134, 104),
  lKnee: j(154, 104),
  rKnee: j(162, 118),
  lAnkle: j(178, 114),
  rAnkle: j(186, 128),
})

const hingeRowHang: Pose = side({
  ...hinge,
  lElbow: j(68, 150),
  rElbow: j(90, 156),
  lWrist: j(54, 182),
  rWrist: j(78, 190),
})

const hingeRowPull: Pose = side({
  ...hinge,
  lElbow: j(90, 116),
  rElbow: j(112, 120),
  lWrist: j(80, 140),
  rWrist: j(104, 146),
})

const floorPressDown: Pose = side({
  head: j(40, 168),
  neck: j(56, 172),
  lShoulder: j(74, 166),
  rShoulder: j(80, 178),
  lElbow: j(58, 146),
  rElbow: j(64, 158),
  lWrist: j(74, 128),
  rWrist: j(80, 140),
  hip: j(120, 176),
  lHip: j(116, 170),
  rHip: j(126, 182),
  lKnee: j(146, 150),
  rKnee: j(152, 162),
  lAnkle: j(172, 166),
  rAnkle: j(178, 178),
})

const floorPressUp: Pose = side({
  ...floorPressDown,
  lElbow: j(72, 124),
  rElbow: j(78, 136),
  lWrist: j(76, 86),
  rWrist: j(82, 98),
})

const pulldownHigh: Pose = side({
  ...idle,
  lElbow: j(96, 40),
  rElbow: j(124, 36),
  lWrist: j(100, 14),
  rWrist: j(126, 10),
})

const pulldownLow: Pose = side({
  ...idle,
  lElbow: j(86, 94),
  rElbow: j(138, 92),
  lWrist: j(98, 122),
  rWrist: j(128, 120),
})

const pressDown: Pose = side({
  ...idle,
  lElbow: j(118, 76),
  rElbow: j(134, 80),
  lWrist: j(132, 94),
  rWrist: j(146, 98),
})

const pressUp: Pose = side({
  ...idle,
  head: j(118, 34),
  lElbow: j(104, 48),
  rElbow: j(132, 42),
  lWrist: j(106, 22),
  rWrist: j(134, 16),
})

const pullHang: Pose = side({
  head: j(110, 92),
  neck: j(110, 74),
  lShoulder: j(96, 62),
  rShoulder: j(122, 58),
  lElbow: j(92, 36),
  rElbow: j(126, 30),
  lWrist: j(100, 16),
  rWrist: j(122, 12),
  hip: j(112, 148),
  lHip: j(102, 152),
  rHip: j(122, 152),
  lKnee: j(104, 188),
  rKnee: j(122, 188),
  lAnkle: j(102, 224),
  rAnkle: j(122, 224),
})

const pullChin: Pose = side({
  head: j(112, 42),
  neck: j(112, 28),
  lShoulder: j(96, 36),
  rShoulder: j(124, 32),
  lElbow: j(78, 48),
  rElbow: j(140, 42),
  lWrist: j(100, 16),
  rWrist: j(122, 12),
  hip: j(114, 108),
  lHip: j(104, 112),
  rHip: j(124, 112),
  lKnee: j(106, 152),
  rKnee: j(124, 152),
  lAnkle: j(104, 192),
  rAnkle: j(124, 192),
})

const dipHigh: Pose = side({
  head: j(118, 48),
  neck: j(116, 66),
  lShoulder: j(100, 74),
  rShoulder: j(124, 78),
  lElbow: j(88, 96),
  rElbow: j(136, 100),
  lWrist: j(78, 84),
  rWrist: j(146, 86),
  hip: j(112, 128),
  lHip: j(102, 132),
  rHip: j(122, 132),
  lKnee: j(108, 168),
  rKnee: j(126, 168),
  lAnkle: j(106, 206),
  rAnkle: j(126, 206),
})

const dipLow: Pose = side({
  head: j(122, 78),
  neck: j(118, 96),
  lShoulder: j(102, 108),
  rShoulder: j(126, 112),
  lElbow: j(82, 122),
  rElbow: j(146, 126),
  lWrist: j(78, 84),
  rWrist: j(146, 86),
  hip: j(114, 158),
  lHip: j(104, 162),
  rHip: j(124, 162),
  lKnee: j(110, 192),
  rKnee: j(128, 192),
  lAnkle: j(108, 224),
  rAnkle: j(128, 224),
})

const bridgeDown: Pose = side({
  head: j(42, 168),
  neck: j(58, 172),
  lShoulder: j(72, 168),
  rShoulder: j(78, 180),
  lElbow: j(64, 188),
  rElbow: j(70, 200),
  lWrist: j(56, 206),
  rWrist: j(62, 218),
  hip: j(118, 176),
  lHip: j(114, 170),
  rHip: j(124, 182),
  lKnee: j(148, 168),
  rKnee: j(156, 180),
  lAnkle: j(176, 188),
  rAnkle: j(182, 200),
})

const bridgeUp: Pose = side({
  head: j(42, 168),
  neck: j(58, 164),
  lShoulder: j(74, 158),
  rShoulder: j(80, 170),
  lElbow: j(64, 180),
  rElbow: j(70, 192),
  lWrist: j(56, 202),
  rWrist: j(62, 214),
  hip: j(120, 118),
  lHip: j(116, 112),
  rHip: j(126, 124),
  lKnee: j(148, 158),
  rKnee: j(156, 170),
  lAnkle: j(176, 188),
  rAnkle: j(182, 200),
})

const sitDown: Pose = side({
  head: j(44, 188),
  neck: j(60, 192),
  lShoulder: j(76, 186),
  rShoulder: j(82, 198),
  lElbow: j(68, 166),
  rElbow: j(74, 178),
  lWrist: j(60, 148),
  rWrist: j(66, 160),
  hip: j(122, 200),
  lHip: j(118, 194),
  rHip: j(128, 206),
  lKnee: j(150, 188),
  rKnee: j(156, 200),
  lAnkle: j(176, 184),
  rAnkle: j(182, 196),
})

const sitUp: Pose = side({
  head: j(86, 112),
  neck: j(94, 130),
  lShoulder: j(100, 146),
  rShoulder: j(110, 154),
  lElbow: j(88, 166),
  rElbow: j(122, 170),
  lWrist: j(78, 186),
  rWrist: j(132, 188),
  hip: j(122, 200),
  lHip: j(118, 194),
  rHip: j(128, 206),
  lKnee: j(150, 188),
  rKnee: j(156, 200),
  lAnkle: j(176, 184),
  rAnkle: j(182, 196),
})

const hollowA: Pose = side({
  head: j(48, 150),
  neck: j(64, 154),
  lShoulder: j(80, 148),
  rShoulder: j(86, 160),
  lElbow: j(58, 136),
  rElbow: j(64, 148),
  lWrist: j(38, 128),
  rWrist: j(44, 140),
  hip: j(118, 164),
  lHip: j(114, 158),
  rHip: j(124, 170),
  lKnee: j(146, 154),
  rKnee: j(152, 166),
  lAnkle: j(172, 148),
  rAnkle: j(178, 160),
})

const hollowB: Pose = {
  ...hollowA,
  lWrist: j(32, 120),
  rWrist: j(38, 132),
  lAnkle: j(178, 142),
  rAnkle: j(184, 154),
}

const deadBugA: Pose = side({
  head: j(46, 156),
  neck: j(62, 160),
  lShoulder: j(78, 154),
  rShoulder: j(84, 166),
  lElbow: j(64, 132),
  rElbow: j(96, 148),
  lWrist: j(52, 112),
  rWrist: j(108, 132),
  hip: j(120, 168),
  lHip: j(116, 162),
  rHip: j(126, 174),
  lKnee: j(138, 140),
  rKnee: j(154, 176),
  lAnkle: j(128, 118),
  rAnkle: j(176, 188),
})

const deadBugB: Pose = side({
  ...deadBugA,
  lElbow: j(96, 148),
  rElbow: j(64, 132),
  lWrist: j(108, 132),
  rWrist: j(52, 112),
  lKnee: j(154, 176),
  rKnee: j(138, 140),
  lAnkle: j(176, 188),
  rAnkle: j(128, 118),
})

const supermanA: Pose = side({
  head: j(48, 168),
  neck: j(64, 166),
  lShoulder: j(80, 168),
  rShoulder: j(86, 176),
  lElbow: j(62, 162),
  rElbow: j(68, 170),
  lWrist: j(42, 158),
  rWrist: j(48, 166),
  hip: j(118, 176),
  lHip: j(114, 170),
  rHip: j(124, 182),
  lKnee: j(146, 174),
  rKnee: j(152, 182),
  lAnkle: j(172, 176),
  rAnkle: j(178, 184),
})

const supermanB: Pose = side({
  head: j(42, 148),
  neck: j(60, 152),
  lShoulder: j(80, 158),
  rShoulder: j(86, 166),
  lElbow: j(56, 148),
  rElbow: j(62, 156),
  lWrist: j(32, 140),
  rWrist: j(38, 148),
  hip: j(118, 168),
  lHip: j(114, 162),
  rHip: j(124, 174),
  lKnee: j(148, 160),
  rKnee: j(154, 168),
  lAnkle: j(176, 154),
  rAnkle: j(182, 162),
})

const climberLeft: Pose = side({
  ...pushHigh,
  lKnee: j(84, 94),
  lAnkle: j(96, 66),
  rKnee: j(162, 112),
  rAnkle: j(188, 120),
})

const climberRight: Pose = side({
  ...pushHigh,
  lKnee: j(154, 98),
  lAnkle: j(182, 104),
  rKnee: j(92, 108),
  rAnkle: j(106, 82),
})

const crawlA: Pose = side({
  head: j(52, 100),
  neck: j(66, 106),
  lShoulder: j(80, 100),
  rShoulder: j(88, 114),
  lElbow: j(74, 128),
  rElbow: j(84, 142),
  lWrist: j(70, 152),
  rWrist: j(80, 166),
  hip: j(128, 108),
  lHip: j(122, 102),
  rHip: j(136, 116),
  lKnee: j(118, 142),
  rKnee: j(158, 128),
  lAnkle: j(108, 166),
  rAnkle: j(176, 148),
})

const crawlB: Pose = side({
  head: j(60, 100),
  neck: j(74, 106),
  lShoulder: j(88, 100),
  rShoulder: j(96, 114),
  lElbow: j(82, 128),
  rElbow: j(92, 142),
  lWrist: j(78, 152),
  rWrist: j(88, 166),
  hip: j(136, 108),
  lHip: j(130, 102),
  rHip: j(144, 116),
  lKnee: j(166, 128),
  rKnee: j(126, 142),
  lAnkle: j(184, 148),
  rAnkle: j(116, 166),
})

const carryA: Pose = side({
  ...idle,
  lWrist: j(90, 150),
  rWrist: j(132, 154),
  lKnee: j(84, 180),
  rKnee: j(138, 172),
  lAnkle: j(68, 228),
  rAnkle: j(152, 222),
})

const carryB: Pose = side({
  ...idle,
  head: j(122, 36),
  lWrist: j(90, 150),
  rWrist: j(132, 154),
  lKnee: j(138, 172),
  rKnee: j(84, 180),
  lAnkle: j(152, 222),
  rAnkle: j(68, 228),
})

const hangRaiseA: Pose = side({
  ...pullHang,
})

const hangRaiseB: Pose = side({
  ...pullHang,
  lKnee: j(118, 140),
  rKnee: j(132, 140),
  lAnkle: j(132, 118),
  rAnkle: j(146, 118),
})

const pallofA: Pose = side({
  ...idle,
  lElbow: j(112, 92),
  rElbow: j(124, 96),
  lWrist: j(122, 112),
  rWrist: j(132, 116),
})

const pallofB: Pose = side({
  ...idle,
  lElbow: j(124, 78),
  rElbow: j(142, 80),
  lWrist: j(158, 74),
  rWrist: j(176, 76),
})

const pressStandA: Pose = side({
  ...idle,
  lElbow: j(108, 96),
  rElbow: j(122, 100),
  lWrist: j(118, 118),
  rWrist: j(130, 122),
})

const pressStandB: Pose = side({
  ...idle,
  lElbow: j(128, 86),
  rElbow: j(146, 88),
  lWrist: j(162, 84),
  rWrist: j(180, 86),
})

const pullApartA: Pose = front({
  head: j(100, 36),
  neck: j(100, 56),
  lShoulder: j(78, 66),
  rShoulder: j(122, 66),
  lElbow: j(58, 88),
  rElbow: j(142, 88),
  lWrist: j(86, 96),
  rWrist: j(114, 96),
  hip: j(100, 126),
  lHip: j(90, 130),
  rHip: j(110, 130),
  lKnee: j(88, 176),
  rKnee: j(112, 176),
  lAnkle: j(86, 228),
  rAnkle: j(114, 228),
})

const pullApartB: Pose = front({
  ...pullApartA,
  lElbow: j(42, 78),
  rElbow: j(158, 78),
  lWrist: j(24, 70),
  rWrist: j(176, 70),
})

const renegadeA: Pose = side({
  ...pushHigh,
  rElbow: j(96, 88),
  rWrist: j(108, 72),
})

const renegadeB: Pose = side({
  ...pushHigh,
})

const thrusterDown: Pose = squatDown

const thrusterUp: Pose = pressUp

const jackClosed: Pose = front({
  head: j(100, 36),
  neck: j(100, 56),
  lShoulder: j(78, 66),
  rShoulder: j(122, 66),
  lElbow: j(78, 100),
  rElbow: j(122, 100),
  lWrist: j(78, 132),
  rWrist: j(122, 132),
  hip: j(100, 126),
  lHip: j(90, 130),
  rHip: j(110, 130),
  lKnee: j(90, 176),
  rKnee: j(110, 176),
  lAnkle: j(90, 228),
  rAnkle: j(110, 228),
})

const jackOpen: Pose = front({
  head: j(100, 32),
  neck: j(100, 52),
  lShoulder: j(76, 64),
  rShoulder: j(124, 64),
  lElbow: j(48, 44),
  rElbow: j(152, 44),
  lWrist: j(28, 18),
  rWrist: j(172, 18),
  hip: j(100, 124),
  lHip: j(86, 128),
  rHip: j(114, 128),
  lKnee: j(58, 172),
  rKnee: j(142, 172),
  lAnkle: j(36, 220),
  rAnkle: j(164, 220),
})

const burpeeSquat: Pose = side({
  ...squatDown,
  lElbow: j(92, 176),
  rElbow: j(128, 180),
  lWrist: j(88, 226),
  rWrist: j(124, 228),
})

const restPose: Pose = side({
  ...idle,
  lElbow: j(88, 92),
  rElbow: j(136, 94),
  lWrist: j(104, 124),
  rWrist: j(120, 126),
})

const celebrateA: Pose = front({
  ...jackOpen,
})

const celebrateB: Pose = front({
  ...jackOpen,
  head: j(100, 26),
  lWrist: j(22, 28),
  rWrist: j(178, 28),
})

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpJoint(a: Joint, b: Joint, t: number): Joint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const keys = Object.keys(a).filter((key) => key !== 'view') as Exclude<keyof Pose, 'view'>[]
  const out = { ...a, view: a.view ?? b.view }
  for (const key of keys) {
    out[key] = lerpJoint(a[key], b[key], t)
  }
  return out
}

function easeInOut(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t)
}

export function sampleLoop(poses: Pose[], t: number): Pose {
  const first = poses[0] ?? idle
  if (poses.length <= 1) return first
  const n = poses.length
  const wrapped = ((t % 1) + 1) % 1
  const idx = Math.floor(wrapped * n)
  const local = easeInOut(wrapped * n - idx)
  const a = poses[idx] ?? first
  const b = poses[(idx + 1) % n] ?? first
  return lerpPose(a, b, local)
}

export const POSE_LOOPS: Record<string, Pose[]> = {
  idle: [idle, { ...idle, head: j(118, 34) }],
  squat: [squatReady, squatDown],
  'jump-squat': [squatReady, squatDown, jumpExtend],
  hinge: [hingeReady, hinge],
  lunge: [lungeUp, lungeDown],
  'step-up': [stepUp, {
    ...stepUp,
    head: j(124, 18),
    hip: j(114, 100),
    rKnee: j(148, 138),
    rAnkle: j(156, 176),
  }],
  'push-up': [pushHigh, pushLow],
  pike: [pike, pikeDown],
  plank: [plankA, plankB],
  'side-plank': [sidePlankA, sidePlankB],
  row: [rowHang, rowPull],
  'hinge-row': [hingeRowHang, hingeRowPull],
  press: [pressDown, pressUp],
  'press-floor': [floorPressDown, floorPressUp],
  'press-stand': [pressStandA, pressStandB],
  pulldown: [pulldownHigh, pulldownLow],
  'pull-up': [pullHang, pullChin],
  dip: [dipHigh, dipLow],
  bridge: [bridgeDown, bridgeUp],
  'sit-up': [sitDown, sitUp],
  hollow: [hollowA, hollowB],
  'dead-bug': [deadBugA, deadBugB],
  superman: [supermanA, supermanB],
  'mountain-climber': [climberLeft, climberRight],
  crawl: [crawlA, crawlB],
  carry: [carryA, carryB],
  'hang-raise': [hangRaiseA, hangRaiseB],
  pallof: [pallofA, pallofB],
  'pull-apart': [pullApartA, pullApartB],
  renegade: [renegadeA, renegadeB],
  thruster: [thrusterDown, thrusterUp],
  'jumping-jack': [jackClosed, jackOpen],
  burpee: [idle, burpeeSquat, pushHigh, jumpExtend],
  rest: [restPose, { ...restPose, head: j(118, 34) }],
  celebrate: [celebrateA, celebrateB],
}

export const LOOP_MS: Record<string, number> = {
  idle: 2200,
  squat: 1300,
  'jump-squat': 1100,
  hinge: 1400,
  lunge: 1400,
  'step-up': 1200,
  'push-up': 1300,
  pike: 1400,
  plank: 2600,
  'side-plank': 2400,
  row: 1200,
  'hinge-row': 1200,
  press: 1200,
  'press-floor': 1300,
  'press-stand': 1200,
  pulldown: 1300,
  'pull-up': 1500,
  dip: 1300,
  bridge: 1400,
  'sit-up': 1400,
  hollow: 2400,
  'dead-bug': 1600,
  superman: 1800,
  'mountain-climber': 520,
  crawl: 700,
  carry: 700,
  'hang-raise': 1400,
  pallof: 1600,
  'pull-apart': 1200,
  renegade: 1400,
  thruster: 1200,
  'jumping-jack': 720,
  burpee: 2400,
  rest: 2200,
  celebrate: 700,
}

export function posesFor(exerciseId: string, phase: 'work' | 'rest' | 'celebrate'): Pose[] {
  if (phase === 'rest') return POSE_LOOPS.rest ?? [idle]
  if (phase === 'celebrate') return POSE_LOOPS.celebrate ?? [idle]
  return POSE_LOOPS[exerciseId] ?? POSE_LOOPS.idle ?? [idle]
}

// Whether a workout animation loop exists for this exercise (work phase).
export function hasPose(exerciseId: string): boolean {
  return Boolean(POSE_LOOPS[exerciseId])
}

export function durationFor(exerciseId: string, phase: 'work' | 'rest' | 'celebrate'): number {
  if (phase === 'rest') return LOOP_MS.rest ?? 2200
  if (phase === 'celebrate') return LOOP_MS.celebrate ?? 700
  return LOOP_MS[exerciseId] ?? LOOP_MS.idle ?? 2200
}
