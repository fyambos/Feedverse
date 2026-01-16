module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Load backend/.env before tests so config-only tests can read env vars.
  setupFiles: ['<rootDir>/jest.env.setup.js'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  roots: ['<rootDir>/src'],
};
