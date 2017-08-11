"use strict";

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

boilerplate({
  build: 'appium-ios-simulator',
  e2eTest: {
    files: 'build/test/functional/**/*-e2e-specs.js',
  },
  coverage: {
    files: ['./test/unit/**/*-specs.js'],
    verbose: true,
  },
});
