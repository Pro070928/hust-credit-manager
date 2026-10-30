const {
  dataMeta,
  cohortList,
  collegeList,
  majorList,
  moduleRules
} = require('./catalog')
const { courseCatalog, courseOfferings } = require('./courseData')
const { courseList: curatedCourseList } = require('./curatedData')
const {
  sharedPoliticsChoiceGroup,
  sharedElectiveCourses
} = require('./sharedElectives')
const { curatedRules } = require('./curatedRules')
const {
  cohort2025Directory,
  cohort2025Colleges,
  cohort2025Meta
} = require('./directory2025')
const {
  cohort2024Directory,
  cohort2024Colleges,
  cohort2024Meta
} = require('./directory2024')
const {
  cohort2023Directory,
  cohort2023Colleges,
  cohort2023Meta
} = require('./directory2023')

Object.keys(curatedRules).forEach(function (majorId) {
  moduleRules[majorId] = curatedRules[majorId]
})

const ATTRIBUTES = ['必修', '选修', '选修（限选）', '选修（任选）', '补充认定']

function inferTags(attribute) {
  if (attribute === '补充认定') {
    return ['补充']
  }
  const tags = []
  if (attribute.indexOf('必修') !== -1) {
    tags.push('必修')
  }
  if (attribute.indexOf('选修') !== -1) {
    tags.push('选修')
  }
  if (attribute.indexOf('限选') !== -1) {
    tags.push('限选')
  }
  if (attribute.indexOf('任选') !== -1) {
    tags.push('任选')
  }
  return tags
}

function buildGeneratedCourses() {
  const result = []
  majorList.forEach(function (major) {
    const offers = courseOfferings[major.id]
    if (!offers) {
      return
    }
    const modules = moduleRules[major.id].modules
    offers.forEach(function (offer, index) {
      const catalogItem = courseCatalog[offer[0]]
      const module = modules[offer[1]]
      const attribute = ATTRIBUTES[offer[2]] || '必修'
      result.push({
        id: major.id + '-g' + String(index + 1).padStart(4, '0'),
        majorId: major.id,
        moduleId: module.id,
        name: catalogItem[0],
        credits: catalogItem[1],
        hours: catalogItem[2],
        attribute,
        term: offer[3] || '待定',
        tags: inferTags(attribute),
        choiceGroup: '',
        choiceGroupLabel: '',
        isSupplement: attribute === '补充认定'
      })
    })
  })
  return result
}

const curatedCourses = curatedCourseList.filter(function (course) {
  return course.id !== 'm-gen-e01' && course.id !== 's-gen-e01'
})

majorList.forEach(function (major) {
  const rules = moduleRules[major.id]
  if (
    major.cohort !== '2026' ||
    !rules ||
    !rules.modules.some(function (module) {
    return module.id === 'gen-elective'
    })
  ) {
    return
  }
  if (!rules.choiceGroups.some(function (group) {
    return group.id === sharedPoliticsChoiceGroup.id
  })) {
    rules.choiceGroups = rules.choiceGroups.concat([
      Object.assign({}, sharedPoliticsChoiceGroup)
    ])
    rules.specialRules = rules.specialRules.concat([
      {
        id: major.id + '-politics-selective',
        type: 'choiceGroup',
        groupId: sharedPoliticsChoiceGroup.id,
        title: '思政选择性必修',
        text: '从思政选择性必修课程中任选 1 门，计 2 学分、32 学时。'
      }
    ])
  }
})

const courseList = buildGeneratedCourses().concat(curatedCourses)
const initialSelections = {}

const finalCollegeList = collegeList.slice()
const collegeByName = {}
finalCollegeList.forEach(function (college) {
  collegeByName[college.name] = college
})
cohort2024Colleges.forEach(function (college) {
  if (!collegeByName[college.name]) {
    finalCollegeList.push(college)
    collegeByName[college.name] = college
  }
})
cohort2025Colleges.forEach(function (college) {
  if (!collegeByName[college.name]) {
    finalCollegeList.push(college)
    collegeByName[college.name] = college
  }
})
cohort2023Colleges.forEach(function (college) {
  if (!collegeByName[college.name]) {
    finalCollegeList.push(college)
    collegeByName[college.name] = college
  }
})
const final2024Majors = cohort2024Directory.map(function (major) {
  const college = collegeByName[major.college]
  return Object.assign({}, major, {
    collegeId: college ? college.id : major.collegeId
  })
})
const final2025Majors = cohort2025Directory.map(function (major) {
  const college = collegeByName[major.college]
  return Object.assign({}, major, {
    collegeId: college ? college.id : major.collegeId
  })
})
const final2023Majors = cohort2023Directory.map(function (major) {
  const college = collegeByName[major.college]
  return Object.assign({}, major, {
    collegeId: college ? college.id : major.collegeId
  })
})
const finalMajorList = majorList.concat(
  final2025Majors,
  final2024Majors,
  final2023Majors
)
const finalCohortList = cohortList.concat([
  cohort2025Meta,
  cohort2024Meta,
  cohort2023Meta
])

module.exports = {
  dataMeta,
  cohortList: finalCohortList,
  collegeList: finalCollegeList,
  majorList: finalMajorList,
  moduleRules,
  courseList,
  sharedElectiveCourses,
  initialSelections
}
