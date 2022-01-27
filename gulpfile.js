'use strict';

const gulp = require('gulp');
const boilerplate = require('@appium/gulp-plugins').boilerplate.use(gulp);
const DEFAULTS = require('@appium/gulp-plugins').boilerplate.DEFAULTS;

boilerplate({
  build: 'appium-ios-simulator',
  files: DEFAULTS.files.concat('index.js'),
  coverage: {
    files: ['./build/test/unit/**/*-specs.js'],
    verbose: true
  },
});
