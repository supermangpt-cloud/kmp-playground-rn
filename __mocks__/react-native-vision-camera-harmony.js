/**
 * Jest stand-in for the HarmonyOS vision-camera adaptation.
 *
 * The real module registers a CAPI view and a turbo module at import time,
 * which Jest cannot load. Tests only need the page's props and the scanner
 * callback: `useCodeScanner` returns the scanner unchanged and the `Camera`
 * view exposes `onCodeScanned` through a plain View prop.
 */
'use strict';

const React = require('react');
const {View} = require('react-native');

const Camera = props => React.createElement(View, props);

function useCodeScanner(codeScanner) {
  return codeScanner;
}

function useCameraDevice() {
  return {id: 'back', position: 'back'};
}

function useCameraDevices() {
  return [{id: 'back', position: 'back'}];
}

function useCameraPermission() {
  return {hasPermission: true, requestPermission: async () => true};
}

module.exports = {
  Camera,
  useCodeScanner,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
};
