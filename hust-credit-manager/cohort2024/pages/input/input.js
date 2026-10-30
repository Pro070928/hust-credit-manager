const {
  buildAnalysis,
  getMajorById,
  getRulesByMajorId,
  getCoursesByMajorId,
  normalizeStudyRecords,
  validateSelection,
  getCourseHours,
  calculateCourseEarnedCredits,
  formatCredit
} = require('../../utils/credit')
const {
  getStudyRecords,
  saveStudyRecords,
  getStudyUpdatedAt,
  setLastMajorId,
  getLastMajorId
} = require('../../utils/store')
const {
  isCloudAvailable,
  syncMajorProgress,
  pushMajorProgress
} = require('../../utils/cloudStore')

function formatSavedAt(timestamp) {
  if (!timestamp) {
    return '尚未保存'
  }
  const date = new Date(timestamp)
  const pad = function (value) {
    return String(value).padStart(2, '0')
  }
  return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function semesterRank(term) {
  const match = String(term || '').match(/第(\d+)/)
  if (match) {
    return Number(match[1]) * 10 + (String(term).includes('-') ? 1 : 0)
  }
  return 999
}

function getSemesterOptions(courses) {
  const terms = []
  const seen = {}
  courses.forEach(function (course) {
    const term = course.term || '待定'
    if (!seen[term]) {
      seen[term] = true
      terms.push(term)
    }
  })
  terms.sort(function (left, right) {
    const rankDiff = semesterRank(left) - semesterRank(right)
    return rankDiff || left.localeCompare(right)
  })
  return ['全部学期'].concat(terms)
}

function buildModuleGroups(majorId, analysis, activeSemester) {
  const rules = getRulesByMajorId(majorId)
  const courses = getCoursesByMajorId(majorId)
  const selectedMap = {}
  analysis.selectedCourses.forEach(function (course) {
    selectedMap[course.id] = course
  })

  return rules.modules
    .map(function (module) {
      const moduleCourses = courses.filter(function (course) {
        return course.moduleId === module.id &&
          (activeSemester === '全部学期' || course.term === activeSemester)
      })
      moduleCourses.sort(function (left, right) {
        return Number(Boolean(right.isShared)) - Number(Boolean(left.isShared))
      })

      if (!moduleCourses.length) {
        return null
      }

      const moduleStat = analysis.modules.find(function (item) {
        return item.id === module.id
      })
      const selectedInModule = moduleCourses.filter(function (course) {
        return Boolean(selectedMap[course.id])
      })
      const requirementText = module.minCourses
        ? '最低 ' + formatCredit(module.minCredits) + ' 学分 · 至少 ' + module.minCourses + ' 门'
        : '最低 ' + formatCredit(module.minCredits) + ' 学分'

      return Object.assign({}, module, {
        courses: moduleCourses.map(function (course) {
          const selectedCourse = selectedMap[course.id]
          const totalHours = getCourseHours(course)
          return Object.assign({}, course, {
            selected: Boolean(selectedCourse),
            creditsText: formatCredit(course.credits),
            hoursText: formatCredit(totalHours),
            completedHours: selectedCourse ? selectedCourse.completedHours : 0,
            earnedText: selectedCourse ? selectedCourse.earnedText : '0',
            completionStyle: selectedCourse ? selectedCourse.completionStyle : 'width: 0%;',
            completionPercent: selectedCourse ? selectedCourse.completionPercent : 0
          })
        }),
        earnedText: moduleStat ? moduleStat.earnedText : '0',
        minCreditsText: formatCredit(module.minCredits),
        progressStyle: moduleStat ? moduleStat.progressStyle : 'width: 0%;',
        selectedCount: selectedInModule.length,
        selectedCountText: selectedInModule.length + ' 门已选',
        requirementText,
        requirementMet: moduleStat ? moduleStat.met : false
      })
    })
    .filter(Boolean)
}

Page({
  data: {
    ready: false,
    major: null,
    moduleGroups: [],
    selectedCount: 0,
    selectedCreditsText: '0',
    selectedHoursText: '0',
    totalPercent: 0,
    hasSelection: false,
    hasConflict: false,
    conflictText: '',
    semesterOptions: [],
    activeSemester: '全部学期',
    emptySemester: false,
    savedAtText: '尚未保存',
    cloudStatusText: '检查云端进度中'
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
    this.majorTotal = Number(major.totalCredits)
    this.courseMap = {}
    const courses = getCoursesByMajorId(majorId)
    courses.forEach(function (course) {
      this.courseMap[course.id] = course
    }.bind(this))
    this.studyRecords = getStudyRecords(majorId)

    setLastMajorId(majorId)
    wx.setNavigationBarTitle({
      title: '录入 · ' + major.name
    })

    const semesterOptions = getSemesterOptions(courses)
    this.setData({
      semesterOptions,
      activeSemester: '全部学期',
      savedAtText: formatSavedAt(getStudyUpdatedAt(majorId))
    })
    this.applyRecords(this.studyRecords, '全部学期', false)
    this.syncFromCloud()
  },

  applyRecords(records, semester, shouldPersist) {
    const activeSemester = semester || this.data.activeSemester || '全部学期'
    const normalized = normalizeStudyRecords(this.majorId, records)
    this.studyRecords = normalized
    const analysis = buildAnalysis(this.majorId, normalized)
    const validation = validateSelection(this.majorId, normalized)
    const moduleGroups = buildModuleGroups(this.majorId, analysis, activeSemester)
    const selectedHours = analysis.selectedCourses.reduce(function (total, course) {
      return total + Number(course.completedHours || 0)
    }, 0)
    if (shouldPersist) {
      saveStudyRecords(this.majorId, normalized)
      this.scheduleCloudPush()
    }

    this.setData({
      ready: true,
      major: Object.assign({}, analysis.major, {
        totalCreditsText: formatCredit(analysis.major.totalCredits)
      }),
      moduleGroups,
      selectedCount: analysis.selectedCount,
      selectedCreditsText: analysis.total.earnedText,
      selectedHoursText: formatCredit(selectedHours),
      totalPercent: analysis.total.percent,
      hasSelection: analysis.selectedCount > 0,
      hasConflict: !validation.valid,
      conflictText: validation.message,
      activeSemester,
      emptySemester: moduleGroups.length === 0,
      savedAtText: shouldPersist
        ? formatSavedAt(Date.now())
        : this.data.savedAtText
    })
  },

  onSemesterSelect(event) {
    const activeSemester = event.currentTarget.dataset.value
    this.setData({ activeSemester })
    this.applyRecords(this.studyRecords, activeSemester, false)
  },

  toggleCourse(event) {
    const courseId = event.currentTarget.dataset.id
    const records = Object.assign({}, this.studyRecords)

    if (Object.prototype.hasOwnProperty.call(records, courseId)) {
      delete records[courseId]
    } else {
      const course = this.courseMap[courseId]
      if (course) {
        records[courseId] = getCourseHours(course)
      }
    }
    this.applyRecords(records, this.data.activeSemester, true)
  },

  setCourseHours(courseId, hours) {
    if (!Object.prototype.hasOwnProperty.call(this.studyRecords, courseId)) {
      return
    }
    const course = this.courseMap[courseId]
    if (!course) {
      return
    }
    const totalHours = getCourseHours(course)
    const parsed = Number(hours)
    const nextHours = Number.isFinite(parsed)
      ? Math.max(0, Math.min(totalHours, Math.round(parsed)))
      : Number(this.studyRecords[courseId] || 0)
    const records = Object.assign({}, this.studyRecords)
    records[courseId] = nextHours
    this.applyRecords(records, this.data.activeSemester, true)
  },

  onHoursInput(event) {
    this.setCourseHours(
      event.currentTarget.dataset.id,
      event.detail.value
    )
  },

  onHoursStep(event) {
    const courseId = event.currentTarget.dataset.id
    const delta = Number(event.currentTarget.dataset.delta)
    const current = Number(this.studyRecords[courseId] || 0)
    this.setCourseHours(courseId, current + delta)
  },

  onHoursChanging(event) {
    const courseId = event.currentTarget.dataset.id
    const moduleIndex = Number(event.currentTarget.dataset.module)
    const courseIndex = Number(event.currentTarget.dataset.course)
    const course = this.courseMap[courseId]
    if (
      !course ||
      !Number.isInteger(moduleIndex) ||
      !Number.isInteger(courseIndex) ||
      !this.data.moduleGroups[moduleIndex] ||
      !this.data.moduleGroups[moduleIndex].courses[courseIndex]
    ) {
      return
    }

    const completedHours = Math.max(
      0,
      Math.min(getCourseHours(course), Number(event.detail.value) || 0)
    )
    const earnedCredits = calculateCourseEarnedCredits(course, completedHours)
    const completionPercent = Math.min(
      100,
      Math.round(completedHours / getCourseHours(course) * 100)
    )
    const previewRecords = Object.assign({}, this.studyRecords)
    previewRecords[courseId] = completedHours

    let previewCredits = 0
    let previewHours = 0
    Object.keys(previewRecords).forEach(function (id) {
      const item = this.courseMap[id]
      if (!item) {
        return
      }
      const itemHours = Number(previewRecords[id]) || 0
      previewCredits += calculateCourseEarnedCredits(item, itemHours)
      previewHours += itemHours
    }.bind(this))

    const path = 'moduleGroups[' + moduleIndex + '].courses[' + courseIndex + ']'
    const updates = {}
    updates[path + '.completedHours'] = completedHours
    updates[path + '.earnedText'] = formatCredit(earnedCredits)
    updates[path + '.completionPercent'] = completionPercent
    updates[path + '.completionStyle'] = 'width: ' + completionPercent + '%;'
    updates.selectedCreditsText = formatCredit(previewCredits)
    updates.selectedHoursText = formatCredit(previewHours)
    updates.totalPercent = Math.min(
      100,
      Math.round(previewCredits / this.majorTotal * 100)
    )
    this.setData(updates)
  },

  onHoursChange(event) {
    this.setCourseHours(
      event.currentTarget.dataset.id,
      event.detail.value
    )
  },

  syncFromCloud() {
    if (!isCloudAvailable()) {
      this.setData({ cloudStatusText: '云同步不可用，本地已保存' })
      return
    }
    const that = this
    syncMajorProgress(this.majorId).then(function (result) {
      if (result.status === 'cloud-applied') {
        that.studyRecords = getStudyRecords(that.majorId)
        that.applyRecords(that.studyRecords, that.data.activeSemester, false)
        that.setData({
          savedAtText: formatSavedAt(getStudyUpdatedAt(that.majorId)),
          cloudStatusText: '已从云端恢复'
        })
        wx.showToast({
          title: '已同步云端进度',
          icon: 'success'
        })
        return
      }
      if (result.status === 'local-pushed') {
        that.setData({ cloudStatusText: '本地进度已上传云端' })
        return
      }
      if (result.status === 'in-sync') {
        that.setData({ cloudStatusText: '云端已是最新' })
        return
      }
      if (result.status === 'no-data') {
        that.setData({ cloudStatusText: '云端暂无记录' })
        return
      }
      that.setData({ cloudStatusText: '云端不可用，本地已保存' })
    }).catch(function () {
      that.setData({ cloudStatusText: '云端同步失败，本地已保存' })
    })
  },

  scheduleCloudPush() {
    clearTimeout(this.cloudPushTimer)
    this.setData({ cloudStatusText: '等待同步云端' })
    this.cloudPushTimer = setTimeout(function () {
      this.pushToCloud()
    }.bind(this), 1200)
  },

  pushToCloud() {
    if (!isCloudAvailable()) {
      this.setData({ cloudStatusText: '云同步不可用，本地已保存' })
      return Promise.resolve()
    }
    this.setData({ cloudStatusText: '正在同步云端' })
    const that = this
    return pushMajorProgress(
      this.majorId,
      this.studyRecords,
      getStudyUpdatedAt(this.majorId)
    ).then(function () {
      that.setData({ cloudStatusText: '已同步到云端' })
    }).catch(function () {
      that.setData({ cloudStatusText: '云端同步失败，本地已保存' })
    })
  },

  copyBackup() {
    const payload = {
      version: 1,
      majorId: this.majorId,
      updatedAt: Date.now(),
      records: this.studyRecords
    }
    const code = 'HUSTCREDIT1:' + JSON.stringify(payload)
    wx.setClipboardData({
      data: code,
      success() {
        wx.showToast({
          title: '备份码已复制',
          icon: 'success'
        })
      }
    })
  },

  restoreBackup() {
    const that = this
    wx.getClipboardData({
      success(result) {
        const text = String(result.data || '')
        if (text.indexOf('HUSTCREDIT1:') !== 0) {
          wx.showModal({
            title: '无法恢复',
            content: '剪贴板中没有有效的 hust学分管家备份码。',
            showCancel: false
          })
          return
        }
        let payload
        try {
          payload = JSON.parse(text.slice('HUSTCREDIT1:'.length))
        } catch (error) {
          wx.showModal({
            title: '无法恢复',
            content: '备份码格式不正确。',
            showCancel: false
          })
          return
        }
        if (!payload || payload.majorId !== that.majorId || !payload.records) {
          wx.showModal({
            title: '无法恢复',
            content: '该备份属于其他专业，请先进入对应专业再恢复。',
            showCancel: false
          })
          return
        }
        const records = normalizeStudyRecords(that.majorId, payload.records)
        wx.showModal({
          title: '恢复进度',
          content: '备份包含 ' + Object.keys(records).length + ' 门课程，恢复后将覆盖当前进度。',
          confirmText: '恢复',
          confirmColor: '#0B4F9C',
          success(modalResult) {
            if (!modalResult.confirm) {
              return
            }
            saveStudyRecords(that.majorId, records)
            that.applyRecords(records, that.data.activeSemester, false)
            that.pushToCloud()
            that.setData({
              savedAtText: formatSavedAt(Date.now())
            })
            wx.showToast({
              title: '进度已恢复',
              icon: 'success'
            })
          }
        })
      }
    })
  },

  onHoursQuick(event) {
    const courseId = event.currentTarget.dataset.id
    const mode = event.currentTarget.dataset.mode
    const course = this.courseMap[courseId]
    if (!course) {
      return
    }
    this.setCourseHours(
      courseId,
      mode === 'full' ? getCourseHours(course) : 0
    )
  },

  noop() {},

  save() {
    const validation = validateSelection(this.majorId, this.studyRecords)
    if (!validation.valid) {
      wx.showModal({
        title: '选课冲突',
        content: validation.message,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: '#0B4F9C'
      })
      return
    }

    saveStudyRecords(this.majorId, this.studyRecords)
    clearTimeout(this.cloudPushTimer)
    this.pushToCloud()
    this.setData({
      savedAtText: formatSavedAt(Date.now())
    })
    wx.showToast({
      title: '学时与学分已更新',
      icon: 'success',
      duration: 1200
    })

    clearTimeout(this.backTimer)
    this.backTimer = setTimeout(function () {
      if (getCurrentPages().length > 1) {
        wx.navigateBack({
          delta: 1
        })
      } else {
        wx.redirectTo({
          url: '/cohort2024/pages/dashboard/dashboard?majorId=' + this.majorId
        })
      }
    }.bind(this), 700)
  },

  clearAll() {
    const that = this
    wx.showModal({
      title: '清空已选课程',
      content: '会清空本专业的所有学时与学分记录，是否继续？',
      confirmText: '清空',
      confirmColor: '#C34850',
      success(result) {
        if (!result.confirm) {
          return
        }
        saveStudyRecords(that.majorId, {})
        that.applyRecords({}, that.data.activeSemester, false)
        that.pushToCloud()
        that.setData({
          savedAtText: formatSavedAt(Date.now())
        })
        wx.showToast({
          title: '已清空',
          icon: 'none'
        })
      }
    })
  },

  goBack() {
    if (getCurrentPages().length > 1) {
      wx.navigateBack({
        delta: 1
      })
      return
    }
    wx.redirectTo({
      url: '/cohort2024/pages/dashboard/dashboard?majorId=' + this.majorId
    })
  },

  onUnload() {
    clearTimeout(this.backTimer)
    clearTimeout(this.cloudPushTimer)
  },

  onHide() {
    if (this.majorId && this.studyRecords) {
      saveStudyRecords(this.majorId, this.studyRecords)
      this.pushToCloud()
    }
  },

  onShareAppMessage() {
    return {
      title: '课程自查记录｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      path: '/cohort2024/pages/dashboard/dashboard?majorId=' + this.majorId
    }
  },

  onShareTimeline() {
    return {
      title: '课程学时自查｜' + (this.data.major ? this.data.major.name : 'hust学分管家'),
      query: 'majorId=' + encodeURIComponent(this.majorId || '')
    }
  }
})

