/**
 * Jest stand-in for react-native-qrcode-svg.
 *
 * The real component renders react-native-svg native elements, which Jest's
 * react-native preset cannot mount. The encoding itself is covered by
 * `__tests__/qr.test.ts`; UI tests only need a view that carries the props and
 * the QR size so the page renders.
 */
'use strict';

const React = require('react');
const {View} = require('react-native');

const QRCode = props =>
  React.createElement(View, {...props, testID: props.testID ?? 'mock-qrcode'});

module.exports = {__esModule: true, default: QRCode};
