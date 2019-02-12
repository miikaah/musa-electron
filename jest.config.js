module.exports = {
  testMatch: ["**/?(*.)+(spec|test).js?(x)"],
  moduleFileExtensions: ["js", "jsx"],
  verbose: false,
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/src/test/"],
  modulePathIgnorePatterns: [
    "<rootDir>/coverage/",
    "<rootDir>/devdist/",
    "<rootDir>/dist/"
  ],
  coveragePathIgnorePatterns: [
    "(.*).json",
    "<rootDir>/node_modules/",
    "<rootDir>/.vscode/",
    "<rootDir>/src/test/stubs/",
    "<rootDir>/src/test/mocks/",
    "<rootDir>/src/jestSetup.ts",
    "<rootDir>/jest.config.js",
    "<rootDir>/mockIndex.js"
  ],
  coverageReporters: ["html", "lcovonly", "text-summary"],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};
