App({
  onLaunch() {
    if (!wx.cloud) {
      console.warn('当前基础库不支持云开发')
      return
    }
    wx.cloud.init({
      env: 'credit-manager-prod-d7b9270117ab',
      traceUser: true
    })
  },

  globalData: {
    appName: 'hust学分管家',
    version: '4.1.0',
    shouldRestoreLastMajor: true
  }
})
