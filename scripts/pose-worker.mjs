// BlazePose inference worker (scripts/pose-worker.mjs)
//
// BlazePose's preprocessing uses tf.image ops (Transform) that the native
// tfjs-node backend does not implement, so each worker runs the pure-JS CPU
// backend. Detectors are created once per worker and reused across exercises;
// the main thread feeds decoded GIF frames and gets back plain keypoint
// snapshots.

import { parentPort, workerData } from 'node:worker_threads'
import util from 'node:util'
import * as tf from '@tensorflow/tfjs'
import * as poseDetection from '@tensorflow-models/pose-detection'

// tfjs 4.x still calls util.isNullOrUndefined on some paths.
util.isNullOrUndefined ??= (v) => v === null || v === undefined

await tf.ready()
await tf.setBackend('cpu')
const detector = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
  runtime: 'tfjs',
  modelType: workerData?.modelType ?? 'full',
  enableSmoothing: false,
})

parentPort.on('message', async ({ id, chunks }) => {
  const frames = []
  for (const chunk of chunks) {
    const tensor = tf.tensor3d(new Uint8Array(chunk.data), [chunk.height, chunk.width, chunk.channels])
    try {
      const poses = await detector.estimatePoses(tensor)
      const det = poses[0]
      if (!det) {
        frames.push(null)
        continue
      }
      const keypoints = {}
      for (const kp of det.keypoints) {
        keypoints[kp.name] = {
          x: Number(kp.x),
          y: Number(kp.y),
          visibility: Number(kp.visibility ?? kp.score ?? 0),
        }
      }
      frames.push({ keypoints })
    } finally {
      tensor.dispose()
    }
  }
  parentPort.postMessage({ id, frames })
})