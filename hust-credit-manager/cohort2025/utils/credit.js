const {
  collegeList,
  majorList,
  moduleRules,
  courseList,
  sharedElectiveCourses,
  initialSelections
} = require('../data/data')

const courseMap = {}
courseList.forEach(function (course) {
  courseMap[course.id] = course
})
sharedElectiveCourses.forEach(function (course) {
  courseMap[course.id] = course
})

const majorMap = {}
majorList.forEach(function (major) {
  majorMap[major.id] = major
})

const coursesByMajorCache = {}
const coursesByModuleCache = {}
const REVIEW_GRADE_LABELS = [
  '一年级（新生）',
  '二年级',
  '三年级',
  '四年级',
  '五年级',
  '六年级',
  '七年级',
  '八年级'
]

function roundCredit(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10
}

function formatCredit(value) {
  const rounded = roundCredit(value)
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function sumCredits(courses) {
  return roundCredit(courses.reduce(function (total, course) {
    return total + Number(course.credits || 0)
  }, 0))
}

function getCourseHours(course) {
  const hours = Number(course.hours || 0)
  if (hours > 0) {
    return roundCredit(hours)
  }
  return Math.max(1, roundCredit(Number(course.credits || 0) * 16))
}

function calculateCourseEarnedCredits(course, completedHours) {
  const totalHours = getCourseHours(course)
  const safeHours = Math.max(0, Math.min(totalHours, Number(completedHours) || 0))
  return roundCredit(Number(course.credits || 0) * safeHours / totalHours)
}

function sumEarnedCredits(courses) {
  return roundCredit(courses.reduce(function (total, course) {
    return total + Number(course.earnedCredits || 0)
  }, 0))
}

function getMajorById(majorId) {
  return majorMap[majorId] || null
}

function getCollegeById(collegeId) {
  return collegeList.find(function (college) {
    return college.id === collegeId
  }) || null
}

function getRulesByMajorId(majorId) {
  return moduleRules[majorId] || null
}

function getCoursesByMajorId(majorId) {
  if (coursesByMajorCache[majorId]) {
    return coursesByMajorCache[majorId]
  }
  const courses = courseList.filter(function (course) {
    return course.majorId === majorId
  })
  const rules = getRulesByMajorId(majorId)
  const major = getMajorById(majorId)
  if (
    major &&
    major.cohort === '2026' &&
    rules &&
    rules.modules.some(function (module) {
    return module.id === 'gen-elective'
    })
  ) {
    sharedElectiveCourses.forEach(function (course) {
      courses.push(Object.assign({}, course, {
        majorId
      }))
    })
  }
  coursesByMajorCache[majorId] = courses
  return courses
}

function getCoursesByModule(majorId, moduleId) {
  const cacheKey = majorId + '::' + moduleId
  if (coursesByModuleCache[cacheKey]) {
    return coursesByModuleCache[cacheKey]
  }
  const courses = getCoursesByMajorId(majorId).filter(function (course) {
    return course.moduleId === moduleId
  })
  coursesByModuleCache[cacheKey] = courses
  return courses
}

function getInitialSelection(majorId) {
  return (initialSelections[majorId] || []).slice()
}

function normalizeStudyRecords(majorId, input) {
  const courses = getCoursesByMajorId(majorId)
  const courseMapForMajor = {}
  courses.forEach(function (course) {
    courseMapForMajor[course.id] = course
  })

  const records = {}
  if (Array.isArray(input)) {
    input.forEach(function (courseId) {
      const course = courseMapForMajor[courseId]
      if (course) {
        records[courseId] = getCourseHours(course)
      }
    })
    return records
  }

  if (input && typeof input === 'object') {
    Object.keys(input).forEach(function (courseId) {
      const course = courseMapForMajor[courseId]
      if (!course) {
        return
      }
      const value = input[courseId]
      const completedHours = value && typeof value === 'object'
        ? value.completedHours
        : value
      const parsed = Number(completedHours)
      records[courseId] = Number.isFinite(parsed)
        ? Math.max(0, Math.min(getCourseHours(course), parsed))
        : 0
    })
  }
  return records
}

function normalizeSelection(majorId, selectedIds) {
  const allowed = {}
  getCoursesByMajorId(majorId).forEach(function (course) {
    allowed[course.id] = true
  })

  const used = {}
  return (Array.isArray(selectedIds) ? selectedIds : []).filter(function (id) {
    if (!allowed[id] || used[id]) {
      return false
    }
    used[id] = true
    return true
  })
}

function evaluateChoiceGroup(group, selectedSet) {
  const selectedCourses = group.courseIds
    .filter(function (courseId) {
      return Boolean(selectedSet[courseId])
    })
    .map(function (courseId) {
      return courseMap[courseId]
    })
    .filter(Boolean)

  const selectedCount = selectedCourses.length
  const minGap = Math.max(0, group.min - selectedCount)
  const isConflict = selectedCount > group.max
  const isMet = selectedCount >= group.min && selectedCount <= group.max

  return {
    id: group.id,
    moduleId: group.moduleId,
    label: group.label,
    min: group.min,
    max: group.max,
    selectedCount,
    selectedCourses,
    selectedNames: selectedCourses.map(function (course) {
      return course.name
    }),
    minGap,
    isConflict,
    isMet,
    statusText: isConflict ? '存在冲突' : (isMet ? '已满足' : '尚未选择')
  }
}

function evaluateRule(rule, moduleStats, groupStats) {
  let earned = null
  let required = null
  let gap = null
  let gapText = ''
  let status = 'info'
  let statusText = '请自查'
  let valueText = ''

  if (rule.type === 'tagMinCredits') {
    const moduleCourses = getCoursesByModule(moduleStats.majorId, rule.moduleId)
    const matchedCourses = moduleCourses
      .filter(function (course) {
        return course.tags.indexOf(rule.tag) !== -1 && Boolean(moduleStats.selectedSet[course.id])
      })
      .map(function (course) {
        return moduleStats.selectedCourseMap[course.id]
      })
      .filter(Boolean)
    earned = sumEarnedCredits(matchedCourses)
    required = rule.required || 0
    if (!required) {
      required = rule.tag === '限选' ? 9 : 6
    }
    gap = roundCredit(Math.max(0, required - earned))
    status = gap > 0 ? 'warning' : 'ok'
    statusText = gap > 0 ? '还差 ' + formatCredit(gap) + ' 学分' : '已满足'
    valueText = formatCredit(earned) + ' / ' + formatCredit(required) + ' 学分'
    gapText = formatCredit(gap)
  }

  if (rule.type === 'minCourseCount') {
    const targetModule = moduleStats.modules.find(function (module) {
      return module.id === rule.moduleId
    })
    const count = targetModule ? targetModule.completedCount : 0
    required = targetModule && targetModule.minCourses ? targetModule.minCourses : 12
    gap = Math.max(0, required - count)
    earned = count
    status = gap > 0 ? 'warning' : 'ok'
    statusText = gap > 0 ? '还差 ' + gap + ' 门' : '已满足'
    valueText = count + ' / ' + required + ' 门'
    gapText = String(gap)
  }

  if (rule.type === 'choiceGroup') {
    const group = groupStats.find(function (item) {
      return item.id === rule.groupId
    })
    if (group) {
      if (group.isConflict) {
        status = 'warning'
        statusText = '只能保留 1 门'
        valueText = '已选 ' + group.selectedCount + ' 门'
      } else if (group.isMet) {
        status = 'ok'
        statusText = '已满足'
        valueText = group.selectedCourses[0] ? group.selectedCourses[0].name : '已完成'
      } else {
        status = 'warning'
        statusText = '尚未选择'
        valueText = '0 / ' + group.min + ' 门'
      }
    }
  }

  if (rule.type === 'static') {
    status = 'info'
    statusText = '请自查'
    valueText = ''
  }

  return Object.assign({}, rule, {
    earned,
    required,
    gap,
    gapText,
    status,
    statusText,
    valueText
  })
}

function buildAnalysis(majorId, selectedIds) {
  const major = getMajorById(majorId)
  const rules = getRulesByMajorId(majorId)
  if (!major || !rules) {
    return null
  }

  const records = normalizeStudyRecords(majorId, selectedIds)
  const normalizedIds = Object.keys(records)
  const selectedSet = {}
  normalizedIds.forEach(function (id) {
    selectedSet[id] = true
  })

  const majorCourses = getCoursesByMajorId(majorId)
  const selectedCourses = majorCourses
    .filter(function (course) {
      return Boolean(selectedSet[course.id])
    })
    .map(function (course) {
      const totalHours = getCourseHours(course)
      const completedHours = records[course.id]
      const earnedCredits = calculateCourseEarnedCredits(course, completedHours)
      const completionPercent = totalHours > 0
        ? Math.min(100, Math.round(completedHours / totalHours * 100))
        : 0
      return Object.assign({}, course, {
        totalHours,
        completedHours,
        earnedCredits,
        earnedText: formatCredit(earnedCredits),
        completionPercent,
        completionStyle: 'width: ' + completionPercent + '%;'
      })
    })
  const selectedCourseMap = {}
  selectedCourses.forEach(function (course) {
    selectedCourseMap[course.id] = course
  })

  const moduleStats = rules.modules.map(function (module) {
    const moduleCourses = majorCourses.filter(function (course) {
      return course.moduleId === module.id
    })
    const completedCourses = selectedCourses.filter(function (course) {
      return course.moduleId === module.id && Number(course.completedHours) > 0
    })
    const earnedCredits = sumEarnedCredits(completedCourses)
    const minCredits = Number(module.minCredits || 0)
    const creditGap = roundCredit(Math.max(0, minCredits - earnedCredits))
    const minCourses = Number(module.minCourses || 0)
    const courseGap = Math.max(0, minCourses - completedCourses.length)
    const met = creditGap === 0 && courseGap === 0
    const percent = minCredits > 0
      ? Math.min(100, Math.round((earnedCredits / minCredits) * 100))
      : 100

    let warningText = ''
    if (!met) {
      if (creditGap > 0) {
        warningText = '还差 ' + formatCredit(creditGap) + ' 学分'
      } else {
        warningText = '还差 ' + courseGap + ' 门课程'
      }
    }

    return Object.assign({}, module, {
      majorId,
      earnedCredits,
      earnedText: formatCredit(earnedCredits),
      minCreditsText: formatCredit(minCredits),
      creditGap,
      gapText: formatCredit(creditGap),
      courseGap,
      completedCount: completedCourses.length,
      minCoursesText: minCourses ? String(minCourses) : '',
      met,
      percent,
      progressStyle: 'width: ' + percent + '%;',
      warningText,
      selectedSet
    })
  })

  const groupStats = rules.choiceGroups.map(function (group) {
    return evaluateChoiceGroup(group, selectedSet)
  })

  const moduleAnalysis = {
    majorId,
    modules: moduleStats,
    selectedSet,
    selectedCourseMap
  }

  const ruleResults = rules.specialRules.map(function (rule) {
    return evaluateRule(rule, moduleAnalysis, groupStats)
  })

  const totalEarned = sumEarnedCredits(selectedCourses)
  const totalRequired = Number(major.totalCredits)
  const totalGap = roundCredit(Math.max(0, totalRequired - totalEarned))
  const totalPercent = totalRequired > 0
    ? Math.min(100, Math.round((totalEarned / totalRequired) * 100))
    : 100
  const missingModules = moduleStats.filter(function (module) {
    return !module.met
  })
  const ruleWarnings = ruleResults.filter(function (rule) {
    return rule.status === 'warning'
  })

  return {
    major,
    modules: moduleStats,
    selectedCourses,
    selectedCount: selectedCourses.length,
    total: {
      earned: totalEarned,
      earnedText: formatCredit(totalEarned),
      required: totalRequired,
      requiredText: formatCredit(totalRequired),
      gap: totalGap,
      gapText: formatCredit(totalGap),
      percent: totalPercent,
      progressStyle: 'width: ' + totalPercent + '%;',
      met: totalGap === 0
    },
    choiceGroups: groupStats,
    rules: ruleResults,
    missingModules,
    ruleWarnings,
    warningCount: missingModules.length + ruleWarnings.length,
    met: missingModules.length === 0 && totalGap === 0
  }
}

/**
 * 保存前校验。当前项目中的互斥组均采用“最多 1 门”的规则。
 */
function validateSelection(majorId, selectedIds) {
  const rules = getRulesByMajorId(majorId)
  if (!rules) {
    return {
      valid: false,
      conflicts: [],
      message: '未找到该专业的模块规则'
    }
  }

  const normalizedIds = Array.isArray(selectedIds)
    ? normalizeSelection(majorId, selectedIds)
    : Object.keys(normalizeStudyRecords(majorId, selectedIds))
  const selectedSet = {}
  normalizedIds.forEach(function (id) {
    selectedSet[id] = true
  })

  const conflicts = []
  rules.choiceGroups.forEach(function (group) {
    const groupResult = evaluateChoiceGroup(group, selectedSet)
    if (groupResult.selectedCount > group.max) {
      conflicts.push({
        groupId: group.id,
        label: group.label,
        courseNames: groupResult.selectedNames,
        message: '冲突：' + groupResult.selectedNames.join(' 和 ') + ' 只能选其一'
      })
    }
  })

  return {
    valid: conflicts.length === 0,
    conflicts,
    message: conflicts.length ? conflicts[0].message : ''
  }
}

/**
 * 按学校秋季学分梳理规则测算学业警示。
 * 一年级新生不参与；二年级黄牌线为 2/3、红牌线为 1/2；
 * 其他年级黄牌线为 3/4、红牌线为 2/3。
 */
function calculateAcademicAlert(totalCredits, earnedCredits, gradeIndex, previousYellows) {
  const total = roundCredit(totalCredits)
  const earned = roundCredit(earnedCredits)
  const safeGradeIndex = Number.isInteger(Number(gradeIndex))
    ? Math.max(0, Math.min(7, Number(gradeIndex)))
    : 0
  const priorYellows = Number.isInteger(Number(previousYellows))
    ? Math.max(0, Math.min(2, Number(previousYellows)))
    : 0
  const gradeLabel = REVIEW_GRADE_LABELS[safeGradeIndex]

  if (safeGradeIndex === 0) {
    return {
      eligible: false,
      level: 'neutral',
      levelText: '新生不参与',
      gradeIndex: safeGradeIndex,
      gradeLabel,
      previousYellows: 0,
      cumulativeYellows: 0,
      yellowThreshold: null,
      redThreshold: null,
      yellowThresholdText: '',
      redThresholdText: '',
      thresholdItems: [],
      numericRuleText: '',
      ratioText: '一年级新生不参加本学年秋季学分梳理',
      summary: '作为一年级新生，本次秋季学分梳理不触发黄牌或红牌。',
      actionRequired: false,
      actionText: '',
      shortfallToYellowText: '',
      shortfallToRedText: ''
    }
  }

  const secondYear = safeGradeIndex === 1
  const yellowRatio = secondYear ? 2 / 3 : 3 / 4
  const redRatio = secondYear ? 1 / 2 : 2 / 3
  const yellowThreshold = roundCredit(total * yellowRatio)
  const redThreshold = roundCredit(total * redRatio)
  const belowRed = earned < redThreshold
  const belowYellow = earned < yellowThreshold
  const level = belowRed ? 'red' : belowYellow ? 'yellow' : 'safe'
  const cumulativeYellows = priorYellows + (level === 'yellow' ? 1 : 0)
  const twoYellowTriggered = priorYellows >= 2 || (level === 'yellow' && cumulativeYellows >= 2)
  const actionRequired = level === 'red' || twoYellowTriggered

  let levelText = '未触发警示'
  let summary = '当前已修 ' + formatCredit(earned) + ' 学分，已达到黄牌线。'
  if (level === 'red') {
    levelText = '红牌警示'
    summary = '当前已修 ' + formatCredit(earned) + ' 学分，低于红牌线 ' +
      formatCredit(redThreshold) + ' 学分。'
  } else if (level === 'yellow') {
    levelText = cumulativeYellows >= 2 ? '第二次黄牌警示' : '黄牌警示'
    summary = '当前已修 ' + formatCredit(earned) + ' 学分，低于黄牌线 ' +
      formatCredit(yellowThreshold) + ' 学分。'
  } else if (priorYellows === 1) {
    summary = '当前未触发本次警示；此前已有 1 次黄牌，再次受到黄牌警示即触发学籍处理。'
  } else if (priorYellows >= 2) {
    levelText = '两次黄牌已累计'
    summary = '此前已累计 2 次黄牌警示，按规则应作相应学籍处理。'
  }

  let actionText = ''
  if (level === 'red') {
    actionText = '属于红牌警示情形：应转入专科学习，否则予以退学处理。'
  } else if (twoYellowTriggered) {
    actionText = '累计两次受到黄牌警示：应转入专科学习，否则予以退学处理。'
  }
  const displayLevel = level === 'safe' && priorYellows >= 2 ? 'red' : level

  return {
    eligible: true,
    level: displayLevel,
    levelText,
    gradeIndex: safeGradeIndex,
    gradeLabel,
    previousYellows: priorYellows,
    cumulativeYellows,
    yellowThreshold,
    redThreshold,
    yellowThresholdText: formatCredit(yellowThreshold),
    redThresholdText: formatCredit(redThreshold),
    thresholdItems: [
      {
        key: 'yellow',
        label: '黄牌线',
        value: formatCredit(yellowThreshold)
      },
      {
        key: 'red',
        label: '红牌线',
        value: formatCredit(redThreshold)
      }
    ],
    numericRuleText: (secondYear ? '二年级' : '三、四年级') +
      '：黄牌线低于 ' + formatCredit(yellowThreshold) +
      ' 学分；红牌线低于 ' + formatCredit(redThreshold) + ' 学分',
    ratioText: secondYear
      ? '二年级：黄牌 < 总学分 2/3，红牌 < 总学分 1/2'
      : '三年级及以上：黄牌 < 总学分 3/4，红牌 < 总学分 2/3',
    summary,
    actionRequired,
    actionText,
    shortfallToYellowText: belowYellow
      ? formatCredit(Math.max(0, yellowThreshold - earned))
      : '0',
    shortfallToRedText: belowRed
      ? formatCredit(Math.max(0, redThreshold - earned))
      : '0'
  }
}

function normalizeTransferName(name) {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/[·•]/g, '')
    .toLowerCase()
}

function buildTransferPlan(fromMajorId, toMajorId, fromRecords, toRecords) {
  const fromMajor = getMajorById(fromMajorId)
  const toMajor = getMajorById(toMajorId)
  if (!fromMajor || !toMajor) {
    return null
  }

  const oldRecords = normalizeStudyRecords(fromMajorId, fromRecords)
  const existingRecords = normalizeStudyRecords(toMajorId, toRecords)
  const oldCourses = getCoursesByMajorId(fromMajorId)
  const newCourses = getCoursesByMajorId(toMajorId)
  const newCourseLookup = {}
  newCourses.forEach(function (course) {
    const key = normalizeTransferName(course.name) + '::' + roundCredit(course.credits)
    if (!newCourseLookup[key]) {
      newCourseLookup[key] = course
    }
  })

  const mergedRecords = Object.assign({}, existingRecords)
  let items = []
  oldCourses.forEach(function (oldCourse) {
    const oldHours = Number(oldRecords[oldCourse.id] || 0)
    if (oldHours <= 0) {
      return
    }
    const key = normalizeTransferName(oldCourse.name) + '::' + roundCredit(oldCourse.credits)
    const newCourse = newCourseLookup[key]
    if (!newCourse) {
      return
    }
    const oldTotalHours = getCourseHours(oldCourse)
    const newTotalHours = getCourseHours(newCourse)
    const targetHours = Math.min(
      newTotalHours,
      Math.max(0, Math.round(newTotalHours * oldHours / oldTotalHours))
    )
    const currentHours = Number(existingRecords[newCourse.id] || 0)
    if (targetHours <= currentHours) {
      return
    }
    mergedRecords[newCourse.id] = targetHours
    items.push({
      oldCourseId: oldCourse.id,
      newCourseId: newCourse.id,
      name: newCourse.name,
      hours: targetHours - currentHours,
      credits: roundCredit(
        calculateCourseEarnedCredits(newCourse, targetHours) -
        calculateCourseEarnedCredits(newCourse, currentHours)
      )
    })
  })

  let skippedCount = 0
  const rules = getRulesByMajorId(toMajorId)
  rules.choiceGroups.forEach(function (group) {
    const existingCount = group.courseIds.filter(function (courseId) {
      return Object.prototype.hasOwnProperty.call(existingRecords, courseId)
    }).length
    let allowance = Math.max(0, group.max - existingCount)
    const importedInGroup = items.filter(function (item) {
      return group.courseIds.indexOf(item.newCourseId) !== -1
    })
    if (existingCount + importedInGroup.length <= group.max) {
      return
    }
    importedInGroup.forEach(function (item) {
      if (allowance > 0) {
        allowance -= 1
        return
      }
      delete mergedRecords[item.newCourseId]
      skippedCount += 1
    })
    items = items.filter(function (item) {
      return Object.prototype.hasOwnProperty.call(mergedRecords, item.newCourseId)
    })
  })

  const totalHours = items.reduce(function (sum, item) {
    return sum + item.hours
  }, 0)
  const totalCredits = roundCredit(items.reduce(function (sum, item) {
    return sum + item.credits
  }, 0))

  return {
    fromMajorId,
    toMajorId,
    fromMajorName: fromMajor.name,
    toMajorName: toMajor.name,
    items,
    records: mergedRecords,
    courseCount: items.length,
    totalHours,
    totalHoursText: formatCredit(totalHours),
    totalCredits,
    totalCreditsText: formatCredit(totalCredits),
    skippedCount
  }
}

module.exports = {
  roundCredit,
  formatCredit,
  sumCredits,
  getMajorById,
  getCollegeById,
  getRulesByMajorId,
  getCoursesByMajorId,
  getCoursesByModule,
  getInitialSelection,
  normalizeSelection,
  normalizeStudyRecords,
  getCourseHours,
  calculateCourseEarnedCredits,
  buildAnalysis,
  validateSelection,
  REVIEW_GRADE_LABELS,
  calculateAcademicAlert,
  buildTransferPlan
}
