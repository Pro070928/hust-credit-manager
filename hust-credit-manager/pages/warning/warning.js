const {
  buildAnalysis,
  getMajorById,
  calculateAcademicAlert
} = require('../../utils/credit')
const {
  getStudyRecords,
  setLastMajorId,
  getLastMajorId,
  getReviewProfile,
  saveReviewProfile
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
    moduleWarnings: [],
    ruleWarnings: [],
    hasWarnings: false,
    warningCount: 0,
    academicAlert: null,
    yellowOptions: ['0 次', '1 次', '2 次'],
    previousYellowIndex: 0
  },

  onLoad(options) {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
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
  },

  onShow() {
    if (this.majorId) {
      this.refresh()
      this.syncFromCloud()
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

  onPullDownRefresh() {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  refresh() {
    const analysis = buildAnalysis(this.majorId, getStudyRecords(this.majorId))
    if (!analysis) {
      return
    }

    const moduleWarnings = analysis.missingModules.map(function (module) {
      return Object.assign({}, module, {
        distanceText: module.creditGap > 0
          ? '距离达标还差 ' + module.gapText + ' 学分'
          : '距离达标还差 ' + module.courseGap + ' 门课程'
      })
    })
    const ruleWarnings = analysis.rules.filter(function (rule) {
      return rule.status === 'warning'
    })
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
      moduleWarnings,
      ruleWarnings,
      hasWarnings: moduleWarnings.length > 0 || ruleWarnings.length > 0,
      warningCount: moduleWarnings.length + ruleWarnings.length,
      academicAlert,
      previousYellowIndex: reviewProfile.previousYellows
    })
  },

  onPreviousYellowChange(event) {
    const previousYellows = Number(event.detail.value)
    const current = getReviewProfile(this.majorId)
    saveReviewProfile(this.majorId, {
      gradeIndex: current.gradeIndex,
      previousYellows
    })
    this.refresh()
  },

  goIndex() {
    wx.reLaunch({
      url: '/pages/index/index'
    })
  },

  goInput() {
    wx.navigateTo({
      url: '/pages/input/input?majorId=' + this.majorId
    })
  },

  goDashboard() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }
    wx.redirectTo({
      url: '/pages/dashboard/dashboard?majorId=' + this.majorId
    })
  },

  onShareAppMessage() {
    return {
      title: '学业自查预警｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      path: '/pages/dashboard/dashboard?majorId=' + this.majorId
    }
  },

  onShareTimeline() {
    return {
      title: '学业自查预警｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      query: 'majorId=' + encodeURIComponent(this.majorId || '')
    }
  }
})
