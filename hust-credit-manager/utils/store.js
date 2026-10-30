const {
  normalizeStudyRecords,
  getInitialSelection,
  getMajorById
} = require('./credit')

const SELECTION_PREFIX = 'hust_credit_manager_selection_'
const STUDY_PREFIX = 'hust_credit_manager_study_'
const STUDY_BACKUP_PREFIX = 'hust_credit_manager_study_backup_'
const STUDY_UPDATED_PREFIX = 'hust_credit_manager_study_updated_'
const LAST_MAJOR_KEY = 'hust_credit_manager_last_major'
const LAST_COLLEGE_KEY = 'hust_credit_manager_last_college'
const LAST_COHORT_KEY = 'hust_credit_manager_last_cohort'
const PREVIOUS_MAJOR_KEY = 'hust_credit_manager_previous_major'
const REVIEW_PREFIX = 'hust_credit_manager_review_'
const GLOBAL_GRADE_KEY = 'hust_credit_manager_global_grade'

function selectionKey(majorId) {
  return SELECTION_PREFIX + majorId
}

function studyKey(majorId) {
  return STUDY_PREFIX + majorId
}

function backupKey(majorId) {
  return STUDY_BACKUP_PREFIX + majorId
}

function updatedKey(majorId) {
  return STUDY_UPDATED_PREFIX + majorId
}

function getStudyRecords(majorId) {
  const stored = wx.getStorageSync(studyKey(majorId))
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    return normalizeStudyRecords(majorId, stored)
  }
  const backup = wx.getStorageSync(backupKey(majorId))
  if (backup && typeof backup === 'object' && !Array.isArray(backup)) {
    return normalizeStudyRecords(majorId, backup)
  }
  const legacySelection = wx.getStorageSync(selectionKey(majorId))
  if (Array.isArray(legacySelection)) {
    return normalizeStudyRecords(majorId, legacySelection)
  }
  return normalizeStudyRecords(majorId, getInitialSelection(majorId))
}

function saveStudyRecords(majorId, records, updatedAt) {
  const normalized = normalizeStudyRecords(majorId, records)
  const savedAt = Number(updatedAt) > 0 ? Number(updatedAt) : Date.now()
  wx.setStorageSync(backupKey(majorId), normalized)
  wx.setStorageSync(studyKey(majorId), normalized)
  wx.setStorageSync(selectionKey(majorId), Object.keys(normalized))
  wx.setStorageSync(updatedKey(majorId), savedAt)
  return normalized
}

function getStudyUpdatedAt(majorId) {
  const value = Number(wx.getStorageSync(updatedKey(majorId)))
  return Number.isFinite(value) && value > 0 ? value : 0
}

function getSelection(majorId) {
  return Object.keys(getStudyRecords(majorId))
}

function saveSelection(majorId, selectedIds) {
  return Object.keys(saveStudyRecords(majorId, selectedIds))
}

function clearSelection(majorId) {
  wx.setStorageSync(studyKey(majorId), {})
  wx.setStorageSync(backupKey(majorId), {})
  wx.setStorageSync(selectionKey(majorId), [])
  wx.setStorageSync(updatedKey(majorId), Date.now())
  return []
}

function resetAllUserData() {
  let keys = []
  try {
    const info = wx.getStorageInfoSync()
    keys = info && Array.isArray(info.keys) ? info.keys : []
  } catch (error) {
    keys = []
  }
  const ownKeys = keys.filter(function (key) {
    return key.indexOf('hust_credit_manager_') === 0
  })
  ownKeys.forEach(function (key) {
    wx.removeStorageSync(key)
  })
  return ownKeys.length
}

function setLastMajorId(majorId) {
  wx.setStorageSync(LAST_MAJOR_KEY, majorId)
}

function getLastMajorId() {
  return wx.getStorageSync(LAST_MAJOR_KEY) || ''
}

function setLastCollegeId(collegeId) {
  wx.setStorageSync(LAST_COLLEGE_KEY, collegeId)
}

function getLastCollegeId() {
  return wx.getStorageSync(LAST_COLLEGE_KEY) || ''
}

function setLastCohort(cohort) {
  wx.setStorageSync(LAST_COHORT_KEY, cohort || '')
}

function getLastCohort() {
  return wx.getStorageSync(LAST_COHORT_KEY) || ''
}

function setPreviousMajorId(majorId) {
  wx.setStorageSync(PREVIOUS_MAJOR_KEY, majorId || '')
}

function getPreviousMajorId() {
  return wx.getStorageSync(PREVIOUS_MAJOR_KEY) || ''
}

function getAcademicYearStart() {
  const now = new Date()
  return now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1
}

function getCurrentAcademicYearKey() {
  const start = getAcademicYearStart()
  return start + '-' + (start + 1)
}

function getTimelineGradeIndex(cohort) {
  const cohortYear = Number(cohort) || 2026
  const grade = getAcademicYearStart() - cohortYear + 1
  return Math.max(0, Math.min(7, grade - 1))
}

function getDefaultReviewGradeIndex(cohort) {
  return getTimelineGradeIndex(cohort)
}

function getGlobalGradeIndex() {
  const stored = Number(wx.getStorageSync(GLOBAL_GRADE_KEY))
  if (Number.isInteger(stored) && stored >= 0 && stored <= 7) {
    return stored
  }
  return getDefaultReviewGradeIndex()
}

function setGlobalGradeIndex(gradeIndex) {
  const index = Number(gradeIndex)
  if (!Number.isInteger(index) || index < 0 || index > 7) {
    return getGlobalGradeIndex()
  }
  wx.setStorageSync(GLOBAL_GRADE_KEY, index)
  return index
}

function getReviewProfile(majorId) {
  const stored = wx.getStorageSync(REVIEW_PREFIX + majorId)
  const major = getMajorById(majorId)
  const defaultGradeIndex = getDefaultReviewGradeIndex(major ? major.cohort : undefined)
  if (!stored || typeof stored !== 'object') {
    return {
      gradeIndex: defaultGradeIndex,
      previousYellows: 0,
      hasManualGrade: false
    }
  }

  const storedGradeIndex = Number(stored.gradeIndex)
  const previousYellows = Number(stored.previousYellows)
  const manualGradeIsCurrent = stored.gradeSource === 'manual' &&
    stored.academicYearKey === getCurrentAcademicYearKey()
  return {
    gradeIndex: manualGradeIsCurrent &&
      Number.isInteger(storedGradeIndex) &&
      storedGradeIndex >= 0 &&
      storedGradeIndex <= 7
      ? storedGradeIndex
      : defaultGradeIndex,
    previousYellows: Number.isInteger(previousYellows) && previousYellows >= 0 && previousYellows <= 2
      ? previousYellows
      : 0,
    hasManualGrade: manualGradeIsCurrent
  }
}

function saveReviewProfile(majorId, profile) {
  const current = getReviewProfile(majorId)
  const requestedGrade = Number(profile.gradeIndex)
  const next = {
    gradeIndex: Number.isInteger(requestedGrade) && requestedGrade >= 0 && requestedGrade <= 7
      ? requestedGrade
      : current.gradeIndex,
    previousYellows: Number(profile.previousYellows),
    gradeSource: 'manual',
    academicYearKey: getCurrentAcademicYearKey()
  }
  if (Number.isInteger(requestedGrade) && requestedGrade >= 0 && requestedGrade <= 7) {
    setGlobalGradeIndex(requestedGrade)
  }
  if (
    !Number.isInteger(next.previousYellows) ||
    next.previousYellows < 0 ||
    next.previousYellows > 2
  ) {
    next.previousYellows = current.previousYellows
  }
  wx.setStorageSync(REVIEW_PREFIX + majorId, next)
  return {
    gradeIndex: next.gradeIndex,
    previousYellows: next.previousYellows
  }
}

module.exports = {
  getStudyRecords,
  saveStudyRecords,
  getStudyUpdatedAt,
  getSelection,
  saveSelection,
  clearSelection,
  resetAllUserData,
  setLastMajorId,
  getLastMajorId,
  setLastCollegeId,
  getLastCollegeId,
  setLastCohort,
  getLastCohort,
  setPreviousMajorId,
  getPreviousMajorId,
  getDefaultReviewGradeIndex,
  getTimelineGradeIndex,
  getGlobalGradeIndex,
  setGlobalGradeIndex,
  getReviewProfile,
  saveReviewProfile
}
