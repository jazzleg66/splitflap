module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup.js'],
  setupFilesAfterEnv: [],
  testMatch: ['**/tests/**/*.test.js'],
  moduleNameMapper: {
    '^/shared/(.*?)(?:\\?.*)?$': '<rootDir>/public/shared/$1',
    '^/assets/(.*)$': '<rootDir>/assets/$1',
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  coverageThreshold: {
    global: {
      statements: 60,
      branches: 35,
      functions: 60,
      lines: 60,
    },
  },
  collectCoverageFrom: [
    'public/shared/spool.js',
    'server/sessionManager.js',
    'server/config.js',
    'server/contentFilter.js',
    'public/controller/controller.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
};
