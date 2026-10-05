class SearchReceipt {
  constructor(process, action, params = {}) {
    this.id = `receipt_${require('crypto').randomUUID()}`
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
    this.result = { error }
    return this
  }

  setSkipped(reason) {
    this.status = 'skipped'
    this.result = { reason, changed: false }
    return this
  }

  isSuccess() {
    return this.status === 'success'
  }
}

module.exports = { SearchReceipt }
