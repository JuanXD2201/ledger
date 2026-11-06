/** Jest para el dominio: sin DOM, TypeScript compilado con ts-jest. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: { module: 'commonjs', target: 'ES2020', strict: true, noUncheckedIndexedAccess: true, esModuleInterop: true, types: ['jest', 'node'] },
        diagnostics: true,
      },
    ],
  },
};
