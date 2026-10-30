// 2026～2027 学年度第一学期 2026 级普通本科生思政选择性必修课表
// 来源：2026～2027学年度第一学期2026级普通本科生思政选择性必修课课表（20261016）.xlsx

const sharedPoliticsChoiceGroup = {
  id: 'politics-selective-one',
  moduleId: 'gen-elective',
  label: '思政选择性必修（28选1）',
  courseIds: [],
  min: 1,
  max: 1
}

const sharedElectiveCourses = [
  ['GEC0207', '“新医科”中华传统文化经典选读（思政）'],
  ['GEC0209', '《红楼梦》中的法律与社会（思政）'],
  ['GEC0195', '《四书》导读（思政）'],
  ['GEC0193', '长江诗路与荆楚文化（思政）'],
  ['GEC0199', '雕版印刷手工书（思政）'],
  ['GEC0210', '法律影视赏析（思政）'],
  ['GEC0194', '古代小说与社会文化（思政）'],
  ['GEC0202', '汉字与文化（思政）'],
  ['GEC0205', '华科大校史与大学精神（思政）'],
  ['GEC0183', '近代中国与世界（思政）'],
  ['GEC0184', '近代中日关系与中国道路选择（思政）'],
  ['GEC0197', '礼乐文明与中国文化（思政）'],
  ['GEC0186', '马克思主义文艺理论（思政）'],
  ['GEC0206', '美丽中国—中国的城乡建设与文化遗产之美（思政）'],
  ['GEC0203', '深度中国（思政）'],
  ['GEC0192', '生态环境法学（思政）'],
  ['GEC0212', '网络版权法（思政）'],
  ['GEC0196', '阳明心学与人生智慧（思政）'],
  ['GEC0190', '中国传统生态文明思想（思政）'],
  ['GEC0187', '中国古代史学传统（思政）'],
  ['GEC0189', '中国古代外交思想（思政）'],
  ['GEC0188', '中国历史地理（思政）'],
  ['GEC0185', '中国社会保障政策概论（思政）'],
  ['GEC0182', '中国外交与全球治理（思政）'],
  ['GEC0198', '中国文化史（思政）'],
  ['GEC0200', '中国语言的传统、当下与未来（思政）'],
  ['GEC0208', '中国之治（思政）'],
  ['GEC0204', '中华民族共同体概论（思政）']
].map(function (item) {
  return {
    id: 'shared-politics-' + item[0],
    code: item[0],
    name: item[1],
    moduleId: 'gen-elective',
    credits: 2,
    hours: 32,
    attribute: '思政选择性必修',
    tags: ['选修', '思政选择性必修'],
    term: '第1学期',
    choiceGroup: 'politics-selective-one',
    choiceGroupLabel: '思政选择性必修（28选1）',
    isShared: true,
    source: '2026～2027学年度第一学期2026级普通本科生思政选择性必修课课表（20261016）'
  }
})

sharedPoliticsChoiceGroup.courseIds = sharedElectiveCourses.map(function (course) {
  return course.id
})

module.exports = {
  sharedPoliticsChoiceGroup,
  sharedElectiveCourses
}
