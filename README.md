## appium-ios-simulator

[![NPM version](http://img.shields.io/npm/v/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)
[![Downloads](http://img.shields.io/npm/dm/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)
[![Dependency Status](https://david-dm.org/appium/appium-ios-simulator/master.svg)](https://david-dm.org/appium/appium-ios-simulator/master)
[![devDependency Status](https://david-dm.org/appium/appium-ios-simulator/master/dev-status.svg)](https://david-dm.org/appium/appium-ios-simulator/master#info=devDependencies)

[![Build Status](https://api.travis-ci.org/appium/appium-ios-simulator.png?branch=master)](https://travis-ci.org/appium/appium-ios-simulator)
[![Coverage Status](https://coveralls.io/repos/appium/appium-ios-simulator/badge.svg?branch=master)](https://coveralls.io/r/appium/appium-ios-simulator?branch=master)

Appium API for dealing with iOS simulators. Allows the user to find locations of directories and applications, gives access to settings in order to read from and write to simulator plists, and allows control over starting and stopping simulators.

*Note*: Issue tracking for this repo has been disabled. Please use the [main Appium issue tracker](https://github.com/appium/appium/issues) instead.

### Usage

`async getSimulator(udid)`

This is the main entry of this module.
This function returns a simulator object (see below) associated with the udid passed in. If an iOS simulator with the given udid does not exist already on this machine, it will throw an error.

If you want to create a new simulator, you can use the `createDevice()` method of [node-simctl](github.com/appium/node-simctl).

```js
import { getSimulator } from 'appium-ios-simulator';

let sim = await getSimulator('DAE95172-0788-4A85-8D0D-5C85509109E1');
```

### Xcode and iOS versions

See [wikipedia](https://en.wikipedia.org/wiki/Xcode#Xcode_5.0_-_7.x_.28with_arm64_support.29) for details of builds for Xcode versions.

| iOS | Xcode 7.1 beta 3 | Xcode 7.0.1    | Xcode 6.4 | Xcode 6.3.2 | Xcode 6.2 | Xcode 6.1.1 | Xcode 6.0.1 |
|-----|------------------|----------------|-----------|-------------|-----------|-------------|-------------|
| 7.1 | 11D167           | n/a            | 11D167    | 11D167      | 11D167    | 11D167      | 11D167      |
| 8.0 | n/a              | n/a            | n/a       | n/a         | n/a       | n/a         | 12A365      |
| 8.1 | 12B411           | 12B411         | 12B411    | 12B411      | 12B411    | 12B411      | 12B411      |
| 8.2 | 12D508           | 12D508         | 12D508    | 12D508      | 12D508    | n/a         | n/a         |
| 8.3 | 12F70            | 12F70          | 12F70     | 12F69       | 12F70     | n/a         | n/a         |
| 8.4 | 12H141           | 12H141         | 12H141    | 12H141      | 12H141    | n/a         | n/a         |
| 9.0 | 13A344           | 13A340         | n/a       | n/a         | n/a       | n/a         | n/a         |
| 9.1 | 13B134           | n/a            | n/a       | n/a         | n/a       | n/a         | n/a         |


#### file locations

iOS 9.3
  - base
    - ~/Library/Developer/CoreSimulator/Devices/[identifier]/data/
  - safari plists
    - [base]/Containers/Containers/Data/Application/[identifier]/<.com.apple.mobile_container_manager.metadata.plist, com.apple.mobilesafari>
  - locationd cache plists
    - [base]/Library/Caches/locationd/cache.plist
    - [base]/Library/Preferences/com.apple.locationd.plist
  - locationd clients plists
    - [base]/Library/Caches/locationd/clients.plist
  - user settings plists
    - [base]/Library/UserConfigurationProfiles/UserSettings.plist
    - [base]/Library/UserConfigurationProfiles/EffectiveUserSettings.plist
    - [base]/Library/UserConfigurationProfiles/PublicInfo/PublicEffectiveUserSettings.plist
  - other plists
    - [base]/Library/Preferences
  - logs
    - ~/Library/Logs/CoreSimulator/[identifier]/
    - sym linked to [base]/Library/Logs

iOS 9.2, 9.1, 9.0, 8.4, 8.3
  - base
    - ~/Library/Developer/CoreSimulator/Devices/[identifier]/data/
  - safari plists
    - [base]/Containers/Data/Application/[identifier]/<.com.apple.mobile_container_manager.metadata.plist, com.apple.mobilesafari>
  - locationd cache plists
    - [base]/Library/Caches/locationd/cache.plist
    - [base]/Library/Preferences/com.apple.locationd.plist
  - locationd clients plists
    - [base]/Library/Caches/locationd/clients.plist
  - user settings plists
    - [base]/Library/ConfigurationProfiles/UserSettings.plist
    - [base]/Library/ConfigurationProfiles/EffectiveUserSettings.plist
    - [base]/Library/ConfigurationProfiles/PublicInfo/PublicEffectiveUserSettings.plist
  - other plists
    - [base]/Library/Preferences
  - logs
    - ~/Library/Logs/CoreSimulator/[identifier]/
    - sym linked to [base]/Library/Logs

iOS 7.1
  - base
    - ~/Library/Developer/CoreSimulator/Devices/[identifier]/data/
  - safari
    - [base]/Applications/[identifier]/Library/Preferences/com.apple.mobilesafari.plist
  - locationCache
    - [base]/Library/Caches/locationd/cache.plist
    - [base]/Library/Preferences/com.apple.locationd.plist
  - locationClients
    - [base]/Library/Caches/locationd/clients.plist
  - userSettings
    - [base]/Library/ConfigurationProfiles/UserSettings.plist
    - [base]/Library/ConfigurationProfiles/EffectiveUserSettings.plist
    - [base]/Library/ConfigurationProfiles/PublicInfo/PublicEffectiveUserSettings.plist
  - other plists
    - [base]/Library/Preferences
  - logs
    - ~/Library/Logs/CoreSimulator/[identifier]/
    - sym linked to [base]/Library/Logs
