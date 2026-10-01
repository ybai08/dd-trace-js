'use strict'

const assert = require('node:assert/strict')

const { after, afterEach, before, beforeEach, describe, it } = require('mocha')

const agent = require('../../dd-trace/test/plugins/agent')
const { setup, withAwsSdkV3Versions } = require('./spec_helpers')

describe('Plugin', () => {
  describe('aws-sdk (missing region)', function () {
    setup()

    withAwsSdkV3Versions((version) => {
      const REGION_ENV = ['AWS_REGION', 'AWS_DEFAULT_REGION', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE']
      const originalEnv = {}
      const unhandled = []
      const onUnhandledRejection = reason => unhandled.push(reason)
      let sqs

      before(() => {
        return agent.load(['aws-sdk', 'http'], [{}, { server: false }])
      })

      after(() => {
        return agent.close({ ritmReset: false })
      })

      beforeEach(() => {
        for (const name of REGION_ENV) {
          originalEnv[name] = process.env[name]
          delete process.env[name]
        }
        // No shared config file either, so nothing can supply a region.
        process.env.AWS_CONFIG_FILE = '/nonexistent/config'
        process.env.AWS_SHARED_CREDENTIALS_FILE = '/nonexistent/credentials'

        sqs = require(`../../../versions/@aws-sdk/client-sqs@${version}`).get()

        unhandled.length = 0
        process.on('unhandledRejection', onUnhandledRejection)
      })

      afterEach(() => {
        process.removeListener('unhandledRejection', onUnhandledRejection)

        for (const name of REGION_ENV) {
          if (originalEnv[name] === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = originalEnv[name]
          }
        }
      })

      it('should leave the missing region error to the application', async () => {
        const client = new sqs.SQSClient({})

        await assert.rejects(client.send(new sqs.ListQueuesCommand({})), /Region is missing/)

        // Unhandled rejections are reported after the microtask queue drains.
        await new Promise(resolve => setImmediate(resolve))

        assert.deepStrictEqual(unhandled, [])
      })
    })
  })
})
