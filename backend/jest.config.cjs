module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Load backend/.env before tests so config-only tests can read env vars.
  setupFiles: ['<rootDir>/jest.env.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.afterEnv.ts'],
  globalTeardown: '<rootDir>/jest.globalTeardown.ts',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  roots: ['<rootDir>/src'],

  // Coverage (enabled when running `jest --coverage`)
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/dist/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov'],
};
