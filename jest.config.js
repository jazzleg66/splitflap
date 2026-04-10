module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: [],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^/shared/(.*)$': '<rootDir>/public/shared/$1'
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};
