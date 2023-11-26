## appium-ios-simulator

[![NPM version](http://img.shields.io/npm/v/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)
[![Downloads](http://img.shields.io/npm/dm/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)


Appium API for dealing with iOS simulators. The API enables you to use the following features:

- query locations of Simulator-specific directories and applications
- read/write access to Simulator settings
- full control over starting and stopping simulators
- deal with biometric auth, geolocation settings, application permissions, and others

### Usage

`async getSimulator(udid)`

This is the main entry of this module.
This function returns a simulator object (see below) associated with the udid passed in. If an iOS simulator with the given udid does not exist already on this machine, it will throw an error.

If you want to create a new simulator, you can use the `createDevice()` method of [node-simctl](https://github.com/appium/node-simctl).

```js
import { getSimulator } from 'appium-ios-simulator';
import assert from 'node:assert/strict';

const sim = await getSimulator('DAE95172-0788-4A85-8D0D-5C85509109E1');
await sim.run();
assert.equal('Booted', (await sim.stat()).state);
await sim.shutdown();
assert.equal('Shutdown', (await sim.stat()).state);
```

### Third-party tools

The following tools and utilities are not mandatory, but could be used by the appium-ios-simulator, if installed locally, to extend its functionality:

- [Mobile Native Foundation](https://github.com/MobileNativeFoundation)
- [IDB](https://github.com/facebook/idb)
- [AppleSimulatorUtils](https://github.com/wix/AppleSimulatorUtils)
    - For `contacts`, `camera`, `faceid`, `health`, `homekit`, `notifications`, `speech` and `userTracking` permissions

### Xcode and iOS versions

Check [Xcode wikipedia](https://en.wikipedia.org/wiki/Xcode) for more details about Xcode version to iOS version mapping.

### Development

Checkout the repository and run

```bash
npm install
npm run dev
```

Use the following commands to run tests:

```bash
# unit tests
npm run test
# integration tests
npm run e2e-test
```
