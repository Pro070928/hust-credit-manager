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

module.exports = {
  dataMeta,
  cohortList,
  collegeList,
  majorList,
  moduleRules,
  courseList,
  sharedElectiveCourses,
  initialSelections
}
