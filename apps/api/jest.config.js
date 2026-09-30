module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 20000,
  maxWorkers: 1,
  clearMocks: true,
};
