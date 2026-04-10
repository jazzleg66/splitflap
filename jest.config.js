module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup.js'],
  setupFilesAfterEnv: [],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^/shared/(.*)$': '<rootDir>/public/shared/$1',
    '^/assets/(.*)$': '<rootDir>/assets/$1'
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};
