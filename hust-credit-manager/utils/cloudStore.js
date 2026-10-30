const {
  getStudyRecords,
  saveStudyRecords,
  getStudyUpdatedAt
} = require('./store')
const { normalizeStudyRecords } = require('./credit')

const ENV_ID = 'credit-manager-prod-d7b9270117ab'
const COLLECTION_NAME = 'credit_progress'

let db = null
let pushQueue = Promise.resolve()
let clearing = false

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function isCloudAvailable() {
  return typeof wx !== 'undefined' && Boolean(wx.cloud)
}

function getCollection() {
  if (!isCloudAvailable()) {
    throw new Error('cloud-unavailable')
  }
  if (!db) {
    db = wx.cloud.database()
  }
  return db.collection(COLLECTION_NAME)
}

async function pullMajorProgress(majorId) {
  const collection = getCollection()
  const result = await collection
    .where({ majorId })
    .limit(1)
    .get()
  return result.data.length ? result.data[0] : null
}

async function upsertMajorProgress(majorId, records, localUpdatedAt) {
  const collection = getCollection()
  const result = await collection.where({ majorId }).limit(1).get()
  const data = {
    majorId,
    records,
    localUpdatedAt,
    updatedAt: db.serverDate()
  }
  if (result.data.length) {
    await collection.doc(result.data[0]._id).update({ data })
  } else {
    await collection.add({ data })
  }
  return { status: 'pushed', majorId }
}

function pushMajorProgress(majorId, records, localUpdatedAt) {
  if (!isCloudAvailable()) {
    return Promise.resolve({ status: 'unavailable', majorId })
  }
  if (clearing) {
    return Promise.resolve({ status: 'reset-in-progress', majorId })
  }
  const normalized = normalizeStudyRecords(majorId, records)
  const timestamp = Number(localUpdatedAt) > 0 ? Number(localUpdatedAt) : Date.now()
  const task = pushQueue.then(function () {
    return upsertMajorProgress(majorId, normalized, timestamp)
  })
  pushQueue = task.catch(function () {})
  return task
}

function clearAllCloudProgress() {
  if (!isCloudAvailable()) {
    return Promise.resolve({ status: 'unavailable', removed: 0 })
  }
  clearing = true
  const task = pushQueue.then(async function () {
    const collection = getCollection()
    let lastError = null
    let totalRemoved = 0

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        let removed = 0
        while (true) {
          const result = await collection
            .skip(0)
            .limit(20)
            .get()
          if (!result.data.length) {
            break
          }
          for (const document of result.data) {
            await collection.doc(document._id).remove()
            removed += 1
            totalRemoved += 1
          }
          if (result.data.length < 20) {
            break
          }
        }
        const verification = await collection.limit(1).get()
        if (!verification.data.length) {
          return {
            status: 'cleared',
            removed: totalRemoved,
            attempts: attempt + 1
          }
        }
        throw new Error('cloud-verification-failed')
      } catch (error) {
        lastError = error
        if (attempt < 2) {
          await delay(350 * (attempt + 1))
        }
      }
    }
    throw lastError || new Error('cloud-clear-failed')
  })
  pushQueue = task.catch(function () {})
  return task.catch(function (error) {
    return {
      status: 'error',
      removed: 0,
      error: error && error.message ? error.message : String(error)
    }
  }).then(function (result) {
    clearing = false
    return result
  })
}

async function syncMajorProgress(majorId) {
  if (!isCloudAvailable()) {
    return { status: 'unavailable', majorId }
  }

  let remote
  try {
    remote = await pullMajorProgress(majorId)
  } catch (error) {
    return {
      status: 'error',
      majorId,
      error: error && error.message ? error.message : String(error)
    }
  }

  const localUpdatedAt = getStudyUpdatedAt(majorId)
  const localRecords = getStudyRecords(majorId)
  const remoteUpdatedAt = remote ? Number(remote.localUpdatedAt) || 0 : 0
  const remoteRecords = remote
    ? normalizeStudyRecords(majorId, remote.records || {})
    : {}

  if (!remote) {
    if (localUpdatedAt > 0) {
      try {
        await pushMajorProgress(majorId, localRecords, localUpdatedAt)
        return { status: 'local-pushed', majorId, updatedAt: localUpdatedAt }
      } catch (error) {
        return {
          status: 'error',
          majorId,
          error: error && error.message ? error.message : String(error)
        }
      }
    }
    return { status: 'no-data', majorId }
  }

  if (
    remoteUpdatedAt > localUpdatedAt ||
    (localUpdatedAt === 0 && remoteUpdatedAt > 0)
  ) {
    saveStudyRecords(majorId, remoteRecords, remoteUpdatedAt)
    return {
      status: 'cloud-applied',
      majorId,
      updatedAt: remoteUpdatedAt
    }
  }

  if (localUpdatedAt > remoteUpdatedAt) {
    try {
      await pushMajorProgress(majorId, localRecords, localUpdatedAt)
      return { status: 'local-pushed', majorId, updatedAt: localUpdatedAt }
    } catch (error) {
      return {
        status: 'error',
        majorId,
        error: error && error.message ? error.message : String(error)
      }
    }
  }

  return { status: 'in-sync', majorId, updatedAt: localUpdatedAt }
}

module.exports = {
  ENV_ID,
  COLLECTION_NAME,
  isCloudAvailable,
  pullMajorProgress,
  pushMajorProgress,
  clearAllCloudProgress,
  syncMajorProgress
}
