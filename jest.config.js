module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^/shared/(.*)$': '<rootDir>/public/shared/$1',
    '^/assets/(.*)$': '<rootDir>/assets/$1'
  }
};
