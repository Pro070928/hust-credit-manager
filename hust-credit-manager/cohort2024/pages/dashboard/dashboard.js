const {
  buildAnalysis,
  getMajorById,
  calculateAcademicAlert,
  buildTransferPlan
} = require('../../utils/credit')
const {
  getStudyRecords,
  saveStudyRecords,
  setLastMajorId,
  getLastMajorId,
  getReviewProfile,
  getPreviousMajorId,
  setPreviousMajorId
} = require('../../utils/store')
const {
  isCloudAvailable,
  syncMajorProgress
} = require('../../utils/cloudStore')

Page({
  data: {
    ready: false,
    major: null,
    total: null,
    modules: [],
    rules: [],
    selectedCount: 0,
    missingCount: 0,
    warningCount: 0,
    academicAlert: null,
    transferPromptVisible: false,
    transferFromMajorName: '',
    transferCourseCount: 0,
    transferHoursText: '0',
    transferCreditsText: '0',
    transferSkippedCount: 0,
    transferCourseNames: []
  },

  onLoad(options) {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.shouldRestoreLastMajor = false
    }
    const majorId = options.majorId || getLastMajorId()
    const major = getMajorById(majorId)
    if (!major) {
      wx.showToast({
        title: '请先选择专业',
        icon: 'none'
      })
      setTimeout(function () {
        wx.reLaunch({
          url: '/pages/index/index'
        })
      }, 350)
      return
    }

    this.majorId = majorId
    setLastMajorId(majorId)
    wx.setNavigationBarTitle({
      title: major.name
    })
  },

  onShow() {
    if (this.majorId) {
      this.refresh()
      this.syncFromCloud()
      this.maybeOfferTransfer()
    }
  },

  syncFromCloud() {
    if (!isCloudAvailable()) {
      return
    }
    const that = this
    syncMajorProgress(this.majorId).then(function (result) {
      if (result.status === 'cloud-applied') {
        that.refresh()
        if (!that.cloudRestored) {
          that.cloudRestored = true
          wx.showToast({
            title: '已恢复云端进度',
            icon: 'success'
          })
        }
      }
    }).catch(function () {})
  },

  maybeOfferTransfer() {
    if (this.transferChecked) {
      return
    }
    this.transferChecked = true
    const previousMajorId = getPreviousMajorId()
    if (!previousMajorId || previousMajorId === this.majorId) {
      return
    }
    const previousMajor = getMajorById(previousMajorId)
    const currentMajor = getMajorById(this.majorId)
    if (
      !previousMajor ||
      !currentMajor ||
      previousMajor.cohort !== currentMajor.cohort
    ) {
      setPreviousMajorId('')
      return
    }
    const plan = buildTransferPlan(
      previousMajorId,
      this.majorId,
      getStudyRecords(previousMajorId),
      getStudyRecords(this.majorId)
    )
    if (!plan || !plan.courseCount) {
      setPreviousMajorId('')
      return
    }
    this.transferPlan = plan
    this.setData({
      transferPromptVisible: true,
      transferFromMajorName: plan.fromMajorName,
      transferCourseCount: plan.courseCount,
      transferHoursText: plan.totalHoursText,
      transferCreditsText: plan.totalCreditsText,
      transferSkippedCount: plan.skippedCount,
      transferCourseNames: plan.items.slice(0, 6).map(function (item) {
        return item.name
      })
    })
  },

  importTransfer() {
    if (!this.transferPlan) {
      return
    }
    saveStudyRecords(this.majorId, this.transferPlan.records)
    setPreviousMajorId('')
    this.setData({ transferPromptVisible: false })
    this.refresh()
    this.syncFromCloud()
    wx.showToast({
      title: '共同课程已导入',
      icon: 'success'
    })
  },

  dismissTransfer() {
    setPreviousMajorId('')
    this.setData({ transferPromptVisible: false })
    wx.showToast({
      title: '已保留新专业进度',
      icon: 'none'
    })
  },

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  refresh() {
    const studyRecords = getStudyRecords(this.majorId)
    const analysis = buildAnalysis(this.majorId, studyRecords)
    if (!analysis) {
      return
    }
    const reviewProfile = getReviewProfile(this.majorId)
    const academicAlert = calculateAcademicAlert(
      analysis.total.required,
      analysis.total.earned,
      reviewProfile.gradeIndex,
      reviewProfile.previousYellows
    )

    this.setData({
      ready: true,
      major: analysis.major,
      total: analysis.total,
      modules: analysis.modules,
      rules: analysis.rules,
      selectedCount: analysis.selectedCount,
      missingCount: analysis.missingModules.length,
      warningCount: analysis.warningCount,
      academicAlert
    })
  },

  goInput() {
    wx.navigateTo({
      url: '/cohort2024/pages/input/input?majorId=' + this.majorId
    })
  },

  goWarning() {
    wx.navigateTo({
      url: '/cohort2024/pages/warning/warning?majorId=' + this.majorId
    })
  },

  goHome() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  onShareAppMessage() {
    return {
      title: '我的学分自查进度｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      path: '/cohort2024/pages/dashboard/dashboard?majorId=' + this.majorId
    }
  },

  onShareTimeline() {
    return {
      title: '学分自查｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      query: 'majorId=' + encodeURIComponent(this.majorId || '')
    }
  }
})

