appium-ios-simulator
===================

Work in progress, stay tuned!

## Watch

```
npm run watch
```

## Test

```
npm test
```

## Xcode and iOS

See [wikipedia](https://en.wikipedia.org/wiki/Xcode#Xcode_5.0_-_7.x_.28with_arm64_support.29) for details of builds for Xcode versions.

| iOS | Xcode 7.0beta4 | Xcode 6.4 | Xcode 6.3.2 | Xcode 6.2 | Xcode 6.1.1 | Xcode 6.0.1 |
|-----|----------------|-----------|-------------|-----------|-------------|-------------|
| 7.1 | n/a            | 11D167    | 11D167      | 11D167    | 11D167      | 11D167      |
| 8.0 | n/a            | n/a       | n/a         | n/a       | n/a         | 12A365      |
| 8.1 | n/a            | 12B411    | 12B411      | 12B411    | 12B411      | 12B411      |
| 8.2 | n/a            | 12D508    | 12D508      | 12D508    | n/a         | n/a         |
| 8.3 | 12F70          | 12F70     | 12F69       | 12F70     | n/a         | n/a         |
| 8.4 | 12H141         | 12H141    | 12H141      | 12H141    | n/a         | n/a         |
| 9.0 | 13A4305g       | n/a       | n/a         | n/a       | n/a         | n/a         |


### file locations

iOS 9.0, 8.4, 8.3
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
