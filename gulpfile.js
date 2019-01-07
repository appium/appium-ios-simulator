'use strict';

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

boilerplate({
  build: 'appium-ios-simulator',
  coverage: {
    files: ['./build/test/unit/**/*-specs.js'],
    verbose: true
  },
});
