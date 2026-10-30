const {
  dataMeta,
  cohortList,
  collegeList,
  majorList
} = require('../../data/data')
const { buildAnalysis, formatCredit } = require('../../utils/credit')
const {
  getStudyRecords,
  setLastMajorId,
  setLastCollegeId,
  getLastCollegeId,
  getLastMajorId,
  setLastCohort,
  getLastCohort,
  setPreviousMajorId,
  getReviewProfile,
  saveReviewProfile,
  resetAllUserData
} = require('../../utils/store')
const {
  isCloudAvailable,
  clearAllCloudProgress
} = require('../../utils/cloudStore')

const GRADE_OPTIONS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级']

function getDurationYears(major) {
  const duration = String(major.duration || '')
  const digitMatch = duration.match(/([4-8])\s*年/)
  if (digitMatch) {
    return Number(digitMatch[1])
  }
  const chineseMatch = duration.match(/([四五六七八])年/)
  if (chineseMatch) {
    return { 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 }[chineseMatch[1]]
  }
  return 4
}

function getGradeNote(gradeIndex, durationYears) {
  if (gradeIndex === 0) {
    return '一年级新生不参加本学年秋季学分梳理。'
  }
  if (gradeIndex === 1) {
    return '二年级：黄牌低于总学分 2/3，红牌低于 1/2。'
  }
  return '三年级至毕业年级：黄牌低于总学分 3/4，红牌低于 2/3。本专业学制 ' +
    durationYears + ' 年。'
}

function getCohortColleges(cohort) {
  const collegeIds = {}
  majorList.forEach(function (major) {
    if (major.cohort === cohort) {
      collegeIds[major.collegeId] = true
    }
  })
  return collegeList.filter(function (college) {
    return Boolean(collegeIds[college.id])
  })
}

function getCohortMeta(cohort) {
  return cohortList.find(function (item) {
    return item.id === cohort
  }) || cohortList[0]
}

function getDashboardPath(majorId, cohort) {
  const root = ['2023', '2024', '2025'].indexOf(cohort) >= 0 ? '/cohort' + cohort : ''
  return root + '/pages/dashboard/dashboard?majorId=' + majorId
}

Page({
  data: {
    collegeNames: [],
    collegeIndex: -1,
    pickerValue: 0,
    currentCollege: null,
    hasCollege: false,
    majorCards: [],
    cohortList,
    cohort: '2026',
    cohortLabel: '2026级',
    collegeCount: dataMeta.collegeCount,
    majorCount: dataMeta.majorCount,
    volumeCount: dataMeta.volumeCount,
    gradeSheetVisible: false,
    sheetMajor: null,
    sheetGradeOptions: [],
    sheetGradeIndex: 0,
    sheetGradeNote: '',
    resetting: false
  },

  onLoad() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    const lastMajorId = getLastMajorId()
    const lastMajor = majorList.find(function (major) {
      return major.id === lastMajorId
    })
    const savedCohort = getLastCohort()
    const cohort = lastMajor && lastMajor.cohort
      ? lastMajor.cohort
      : (cohortList.some(function (item) { return item.id === savedCohort })
        ? savedCohort
        : cohortList[0].id)
    const cohortMeta = getCohortMeta(cohort)
    const activeColleges = getCohortColleges(cohort)
    this.activeCollegeList = activeColleges
    setLastCohort(cohort)

    const collegeNames = activeColleges.map(function (college) {
      return college.name
    })
    const lastCollegeId = getLastCollegeId()
    const restoredCollegeIndex = activeColleges.findIndex(function (college) {
      return college.id === lastCollegeId
    })
    const currentCollege = restoredCollegeIndex >= 0
      ? activeColleges[restoredCollegeIndex]
      : null
    this.setData({
      cohort,
      cohortLabel: cohortMeta.label,
      collegeCount: activeColleges.length,
      majorCount: cohortMeta.majorCount,
      volumeCount: cohortMeta.volumeCount,
      collegeNames,
      collegeIndex: restoredCollegeIndex,
      pickerValue: restoredCollegeIndex >= 0 ? restoredCollegeIndex : 0,
      currentCollege,
      hasCollege: Boolean(currentCollege),
      majorCards: []
    })
    this.skipNextShow = true
    if (currentCollege) {
      this.refreshMajorCards(restoredCollegeIndex)
    }

    const app = getApp()
    const shouldRestore = app &&
      app.globalData &&
      app.globalData.shouldRestoreLastMajor
    if (app && app.globalData) {
      app.globalData.shouldRestoreLastMajor = false
    }
    const restoreMajor = majorList.find(function (major) {
      return major.id === lastMajorId
    })
    if (shouldRestore && restoreMajor) {
      wx.reLaunch({
        url: getDashboardPath(restoreMajor.id, restoreMajor.cohort)
      })
    }
  },

  onShow() {
    if (this.skipNextShow) {
      this.skipNextShow = false
      return
    }
    if (this.data.currentCollege) {
      this.refreshMajorCards(this.data.collegeIndex)
    }
  },

  onPullDownRefresh() {
    if (this.data.hasCollege) {
      this.refreshMajorCards(this.data.collegeIndex)
    }
    wx.stopPullDownRefresh()
  },

  onCollegeChange(event) {
    const collegeIndex = Number(event.detail.value)
    const currentCollege = this.activeCollegeList[collegeIndex]
    if (!currentCollege) {
      return
    }
    setLastCollegeId(currentCollege.id)
    this.setData({
      collegeIndex,
      pickerValue: collegeIndex,
      currentCollege,
      hasCollege: true
    })
    this.refreshMajorCards(collegeIndex)
  },

  refreshMajorCards(collegeIndex) {
    const college = this.activeCollegeList[collegeIndex]
    if (!college) {
      this.setData({ majorCards: [] })
      return
    }

    const majorCards = majorList
      .filter(function (major) {
        return major.collegeId === college.id &&
          major.cohort === this.data.cohort
      }.bind(this))
      .map(function (major) {
        const analysis = buildAnalysis(major.id, getStudyRecords(major.id))
        const durationYears = getDurationYears(major)
        const profile = getReviewProfile(major.id)
        const gradeIndex = Math.min(profile.gradeIndex, durationYears - 1)
        return {
          id: major.id,
          cohort: major.cohort,
          name: major.name,
          englishName: major.englishName,
          degree: major.degree,
          duration: major.duration,
          tags: major.tags || [],
          summary: major.summary || '',
          isAuto: major.isAuto,
          totalCreditsText: formatCredit(major.totalCredits),
          moduleCount: major.moduleIds.length,
          earnedText: analysis ? analysis.total.earnedText : '0',
          percent: analysis ? analysis.total.percent : 0,
          progressStyle: analysis ? analysis.total.progressStyle : 'width: 0%;',
          durationYears,
          selectedGradeLabel: GRADE_OPTIONS[gradeIndex],
          selectedGradeIndex: gradeIndex
        }
      })

    this.setData({ majorCards })
  },

  openMajor(event) {
    const majorId = event.currentTarget.dataset.id
    const major = this.data.majorCards.find(function (item) {
      return item.id === majorId
    })
    if (!major) {
      return
    }
    const durationYears = major.durationYears
    const profile = getReviewProfile(majorId)
    const gradeIndex = Math.min(profile.gradeIndex, durationYears - 1)
    this.setData({
      gradeSheetVisible: true,
      sheetMajor: major,
      sheetGradeOptions: GRADE_OPTIONS.slice(0, durationYears),
      sheetGradeIndex: gradeIndex,
      sheetGradeNote: getGradeNote(gradeIndex, durationYears)
    })
  },

  onCohortSelect(event) {
    const cohort = event.currentTarget.dataset.cohort
    if (!cohort || cohort === this.data.cohort || this.data.resetting) {
      return
    }
    const that = this
    wx.showModal({
      title: '切换培养方案',
      content: '切换年级会重置所有年级的选课、学时、年级、预警和云端进度，操作不可撤销。是否继续？',
      confirmText: '确认切换',
      cancelText: '取消',
      confirmColor: '#C34850',
      success(result) {
        if (!result.confirm) {
          return
        }
        that.executeReset({
          cohort,
          reload: false
        })
      }
    })
  },

  executeReset(options) {
    const that = this
    const targetCohort = options && options.cohort
    const reload = !options || options.reload !== false
    this.setData({ resetting: true })
    wx.showLoading({
      title: '正在重置数据',
      mask: true
    })

    const clearCloud = isCloudAvailable()
      ? clearAllCloudProgress()
      : Promise.resolve({ status: 'unavailable', removed: 0 })

    clearCloud.then(function (cloudResult) {
      if (cloudResult.status === 'error') {
        wx.hideLoading()
        that.setData({ resetting: false })
        wx.showModal({
          title: '重置失败',
          content: '云端数据清除失败，请检查网络和数据库后重试。本地数据尚未清除。',
          showCancel: false
        })
        return
      }

      resetAllUserData()
      const app = getApp()
      if (app && app.globalData) {
        app.globalData.shouldRestoreLastMajor = false
      }

      if (targetCohort) {
        const cohortMeta = getCohortMeta(targetCohort)
        const activeColleges = getCohortColleges(targetCohort)
        that.activeCollegeList = activeColleges
        setLastCohort(targetCohort)
        setLastCollegeId('')
        setLastMajorId('')
        that.setData({
          cohort: targetCohort,
          cohortLabel: cohortMeta.label,
          collegeNames: activeColleges.map(function (college) {
            return college.name
          }),
          collegeCount: activeColleges.length,
          majorCount: cohortMeta.majorCount,
          volumeCount: cohortMeta.volumeCount,
          collegeIndex: -1,
          pickerValue: 0,
          currentCollege: null,
          hasCollege: false,
          majorCards: [],
          gradeSheetVisible: false,
          sheetMajor: null,
          resetting: false
        })
      } else {
        that.setData({ resetting: false })
      }

      wx.hideLoading()
      wx.showToast({
        title: targetCohort ? '已重置并切换' : '全部数据已重置',
        icon: 'success',
        duration: 1000
      })
      if (reload) {
        setTimeout(function () {
          wx.reLaunch({
            url: '/pages/index/index'
          })
        }, 700)
      }
    }).catch(function () {
      wx.hideLoading()
      that.setData({ resetting: false })
      wx.showModal({
        title: '重置失败',
        content: '数据清除失败，请稍后重试。',
        showCancel: false
      })
    })
  },

  onSheetGradeSelect(event) {
    const gradeIndex = Number(event.currentTarget.dataset.index)
    const durationYears = this.data.sheetMajor.durationYears
    this.setData({
      sheetGradeIndex: gradeIndex,
      sheetGradeNote: getGradeNote(gradeIndex, durationYears)
    })
  },

  closeGradeSheet() {
    this.setData({
      gradeSheetVisible: false,
      sheetMajor: null
    })
  },

  confirmMajor() {
    const major = this.data.sheetMajor
    if (!major) {
      return
    }
    const profile = getReviewProfile(major.id)
    saveReviewProfile(major.id, {
      gradeIndex: this.data.sheetGradeIndex,
      previousYellows: profile.previousYellows
    })
    const previousMajorId = getLastMajorId()
    if (previousMajorId && previousMajorId !== major.id) {
      setPreviousMajorId(previousMajorId)
    }
    setLastMajorId(major.id)
    setLastCohort(major.cohort)
    this.setData({ gradeSheetVisible: false })
    wx.navigateTo({
      url: getDashboardPath(major.id, major.cohort)
    })
  },

  noop() {},

  resetAllData() {
    if (this.data.resetting) {
      return
    }
    const that = this
    wx.showModal({
      title: '重置全部数据',
      content: '将清除所有专业的选课、学时、年级、黄牌次数、本地备份和云端记录，且无法撤销。',
      confirmText: '确认重置',
      confirmColor: '#C34850',
      success(result) {
        if (!result.confirm) {
          return
        }
        that.executeReset({
          reload: true
        })
      }
    })
  },

  onShareAppMessage() {
    return {
      title: 'hust学分管家｜个人非官方学分自查',
      path: '/pages/index/index'
    }
  },

  onShareTimeline() {
    return {
      title: 'hust学分管家｜个人非官方学分自查',
      query: ''
    }
  }
})
