/**
 * Jest stand-in for the HarmonyOS WebView package.
 *
 * The real module resolves through Metro's `harmony` platform to ArkTS-backed
 * native code, which Jest cannot load; tests only need a view that exposes the
 * props (so a test can call `onMessage` / `onShouldStartLoadWithRequest`).
 */
'use strict';

const React = require('react');
const {View} = require('react-native');

const WebView = React.forwardRef((props, _ref) =>
  React.createElement(View, props),
);

module.exports = {WebView, default: WebView};
