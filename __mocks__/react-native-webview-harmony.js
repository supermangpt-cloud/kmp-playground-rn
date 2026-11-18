/**
 * Jest stand-in for the HarmonyOS WebView package.
 *
 * The real module resolves through Metro's `harmony` platform to ArkTS-backed
 * native code, which Jest cannot load; tests only need a view that exposes the
 * props (so a test can call `onMessage` / `onShouldStartLoadWithRequest`).
 */
'use strict';

/* global globalThis */

const React = require('react');
const {View} = require('react-native');

// The native view is destroyed and recreated when a test changes the WebView's
// `key`; counting mounts lets a test tell a remount apart from a plain re-render
// with the same source.
// Kept on `globalThis` because Jest gives the test a separate copy of a mocked
// module; the counter has to be the same object in both copies.
const mounts =
  globalThis.__dsWebViewMockMounts ||
  (globalThis.__dsWebViewMockMounts = {count: 0});

const WebView = React.forwardRef((props, _ref) => {
  React.useEffect(() => {
    mounts.count += 1;
    return () => {
      mounts.count -= 1;
    };
  }, []);
  return React.createElement(View, props);
});

module.exports = {WebView, default: WebView, mounts};
