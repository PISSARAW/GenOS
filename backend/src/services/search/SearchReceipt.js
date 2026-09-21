class SearchReceipt {
  constructor(process, action, params = {}) {
    this.id = `receipt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.process = process
    this.action = action
    this.params = params
    this.timestamp = Date.now()
    this.status = 'pending'
    this.result = null
    this.error = null
  }

  setSuccess(result) {
    this.status = 'success'
    this.result = result
    return this
  }

  setFailure(error) {
    this.status = 'failure'
    this.error = error
    return this
  }

  isSuccess() {
    return this.status === 'success'
  }
}

module.exports = { SearchReceipt }
