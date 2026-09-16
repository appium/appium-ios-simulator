## appium-ios-simulator

[![NPM version](http://img.shields.io/npm/v/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)
[![Downloads](http://img.shields.io/npm/dm/appium-ios-simulator.svg)](https://npmjs.org/package/appium-ios-simulator)

A Node.js API for controlling iOS simulators, used internally by
[Appium](https://appium.io)'s [XCUITest driver](https://github.com/appium/appium-xcuitest-driver).
It talks to `CoreSimulator.framework` directly through [`@appium/coresim`](https://github.com/appium/coresim),
rather than shelling out to `xcrun simctl`, so most operations are faster and return typed,
catchable errors instead of parsed CLI output.

With it you can:

- boot, shut down, erase, and otherwise manage the lifecycle of a simulator
- install, launch, terminate, and inspect apps
- grant, revoke, and query app permissions (contacts, camera, photos, and more)
- control biometrics, geolocation, the pasteboard, and keychain
- change UI settings (appearance, content size, contrast, localization, ...)
- capture screenshots, add media to the Photos library, and spawn guest processes
- look up Simulator-specific directories, apps, and settings on disk

### Requirements

- macOS, with Xcode 15 or newer installed
- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`

### Installation

```bash
npm install appium-ios-simulator
```

### Usage

The main entry point is `getSimulator(udid)`, which returns a `Simulator` instance for an
*existing* simulator (identified by its UDID, e.g. as reported by `xcrun simctl list devices`).
To create a new device first, use [`@appium/coresim`](https://github.com/appium/coresim)'s
`NativeSimctl#createDevice()`.

```js
import { getSimulator } from 'appium-ios-simulator';
import assert from 'node:assert/strict';

const sim = await getSimulator('DAE95172-0788-4A85-8D0D-5C85509109E1');
await sim.run();
assert.equal('Booted', (await sim.stat()).state);

await sim.installApp('/path/to/MyApp.app');
await sim.launchApp('com.example.MyApp');
await sim.setPermission('com.example.MyApp', 'photos', 'yes');

await sim.shutdown();
assert.equal('Shutdown', (await sim.stat()).state);
```

See [`lib/types.ts`](./lib/types.ts) for the full `Simulator` API surface, and
[`test/functional/simulator-e2e.spec.ts`](./test/functional/simulator-e2e.spec.ts) for more
end-to-end examples of most of it in action.

`getSimulator()` also accepts a `devicesSetPath` option to target an isolated, non-default
[device set](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator)
instead of the default one under `~/Library/Developer/CoreSimulator/Devices`.

### Xcode and iOS versions

Check the [Xcode Wikipedia page](https://en.wikipedia.org/wiki/Xcode) for the mapping between
Xcode and iOS versions. Only Xcode 15 and newer are supported.

### Development

Check out the repository and run:

```bash
npm install
npm run dev # tsc --watch
```

```bash
npm run lint    # static analysis
npm run format  # code formatting
```

Use the following commands to run tests:

```bash
npm run test      # unit tests, no simulator required
npm run e2e-test  # functional tests against real simulators
```
