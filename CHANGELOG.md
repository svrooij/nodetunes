# Changelog

## 1.1.0

- Update to the latest dependencies


## 1.0.0

- Fix crypto crash
- Remove Travis config file
- Remove JSCS config file
- Install ESLint, Prettier and use the Airbnb ESLint config
- Set ESLint and Prettier to ignore the tests
- Remove gulp-jscs
- Move npm devDependencies into npm dependencies
- Set Gulp tests to run from a locally install version of Gulp
- Fix ESLint issues
- Remove unused dependencies and update used dependencies

## 0.3.0
- Added support for ALAC encoding (iOS 9, OS X El Capitan)

## 0.2.1
- Bumped mdns version
- Added support for node 4.0.0

## 0.2.0
- Added support for node 0.12.x
- Added jscs airbnb checking to build process

## 0.1.2
- Updated to mdns 2.2.2 (completes 0.11.x support)
- Added warning/disconnect for unsupported codecs (non-PCM)

## 0.1.1
- Added verbose output for Apple Challenge creation

## 0.1.0
- Upgraded to httplike 1.0.1
- Added option for verbose output
- Added disconnect timeout (see #8)

## 0.0.19
- Removed dependency on ursa package.

## 0.0.18
- Locked down dependencies, moved to mdns package

## 0.0.17
- Fixed bug where unknown request method (e.g. `GET`) would crash session
- Removed legacy `MessageBuilder` responses
- Fixed buggy response errors to use `httplike` errors

## 0.0.16
- Added support for fetching human-readable client name

## 0.0.14
- Solved issues created in 0.0.12
- Fixed clientConnected/clientDisconnected issues
- Correct cleanup for RTP binding

## 0.0.12
- EXPERIMENTAL - added testing infrastructure, refactoring.
- Moved to httplike v0.0.7 (trim on method support)

## 0.0.11
- Fixed 'undefined' bug in RTSP replies

## 0.0.10
- Fixed scope leakage issues
- Fixed file naming issues

## 0.0.7
- Changed output audio stream pattern to better match callback pattern. See new ```examples/server.js```

