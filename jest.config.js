export default {
  preset: "ts-jest/presets/default-esm",
  extensionsToTreatAsEsm: [".ts"],
  testEnvironment: "node",
  globals: {
    "ts-jest": {
      useESM: true,
    },
  },
  roots: ["<rootDir>/src/__tests__/unit"],
  testMatch: ["**/?(*.)+(test).ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ES2022",
          moduleResolution: "NodeNext",
          target: "ES2022",
          types: ["jest", "node"],
          allowImportingTsExtensions: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFilesAfterEnv: [],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/index.ts",
    "!src/__tests__/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html", "json"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 30000,
  maxWorkers: "50%",
  verbose: true,
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/coverage/"],
  watchPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/coverage/",
    "\\.tmp",
    "\\.temp",
  ],
};
