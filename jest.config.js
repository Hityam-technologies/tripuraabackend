/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testTimeout: 120000,
  maxWorkers: 1,
  setupFiles: ['<rootDir>/tests/helpers/testEnv.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
