/**
 * The H5 page's own behaviour, with the WebView native module replaced by the
 * Jest view mock from `__mocks__/react-native-webview-harmony.js`: a button
 * message updates the status line, and non-http(s) navigation is rejected and
 * reported instead of being loaded.
 *
 * @format
 */

import {describe, expect, it, jest} from '@jest/globals';
import React from 'react';
import renderer from 'react-test-renderer';

import WebPageScreen, {formatWebMessage} from '../src/screens/WebPageScreen';

function textOf(node: renderer.ReactTestInstance): string {
  const children = node.props.children;
  return (Array.isArray(children) ? children : [children]).join('');
}

describe('formatWebMessage', () => {
  it('formats the JSON payload the page sends', () => {
    expect(formatWebMessage('{"count":2,"at":"14:03:12"}')).toBe(
      '第 2 次点击 · 14:03:12',
    );
  });

  it('shows an unexpected payload verbatim', () => {
    expect(formatWebMessage('plain text')).toBe('plain text');
    expect(formatWebMessage('{"count":"two"}')).toBe('{"count":"two"}');
    expect(formatWebMessage('{"count":1}')).toBe('{"count":1}');
  });
});

describe('WebPageScreen', () => {
  it('starts waiting, then shows the last message from the page', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(<WebPageScreen onBack={() => {}} />);
    });

    const screen = tree!.root;
    expect(textOf(screen.findByProps({testID: 'web-last-message'}))).toContain(
      '等待 H5 页面回传',
    );

    const webView = screen.findByProps({testID: 'web-view'});
    renderer.act(() => {
      webView.props.onMessage({
        nativeEvent: {data: '{"count":2,"at":"14:03:12"}'},
      });
    });
    expect(textOf(screen.findByProps({testID: 'web-last-message'}))).toBe(
      '最近一次回传：第 2 次点击 · 14:03:12',
    );

    renderer.act(() => {
      webView.props.onMessage({nativeEvent: {data: 'opaque payload'}});
    });
    expect(textOf(screen.findByProps({testID: 'web-last-message'}))).toBe(
      '最近一次回传：opaque payload',
    );

    renderer.act(() => {
      tree!.unmount();
    });
  });

  it('allows the local document and http(s), and blocks custom schemes', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(<WebPageScreen onBack={() => {}} />);
    });
    const screen = tree!.root;
    const shouldStart = screen.findByProps({testID: 'web-view'}).props
      .onShouldStartLoadWithRequest;

    let allowed: boolean | undefined;
    renderer.act(() => {
      allowed = shouldStart({url: 'about:blank'});
    });
    expect(allowed).toBe(true);
    renderer.act(() => {
      allowed = shouldStart({url: 'https://example.com'});
    });
    expect(allowed).toBe(true);

    renderer.act(() => {
      allowed = shouldStart({url: 'tuitui://h5-demo/landing'});
    });
    expect(allowed).toBe(false);
    expect(textOf(screen.findByProps({testID: 'web-blocked'}))).toBe(
      '已拦截非 http(s) 跳转：tuitui://h5-demo/landing',
    );

    renderer.act(() => {
      tree!.unmount();
    });
  });

  it('calls onBack from the header button', () => {
    const onBack = jest.fn();
    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(<WebPageScreen onBack={onBack} />);
    });

    renderer.act(() => {
      tree!.root.findByProps({testID: 'web-back'}).props.onPress();
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    renderer.act(() => {
      tree!.unmount();
    });
  });
});
