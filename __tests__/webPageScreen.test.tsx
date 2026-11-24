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
    const webView = screen.findByProps({testID: 'web-view'});
    const shouldStart = webView.props.onShouldStartLoadWithRequest;

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
      webView.props.onMessage({
        nativeEvent: {data: '{"count":1,"at":"14:03:12"}'},
      });
    });
    renderer.act(() => {
      allowed = shouldStart({url: 'tuitui://h5-demo/landing'});
    });
    expect(allowed).toBe(false);
    expect(textOf(screen.findByProps({testID: 'web-blocked'}))).toBe(
      '已拦截非 http(s) 跳转：tuitui://h5-demo/landing',
    );

    // The HarmonyOS adapter blanks the native view when a navigation is
    // refused; the screen remounts it with the local document and the last
    // counter value instead of leaving a blank page.
    const restored = screen.findByProps({testID: 'web-view'});
    expect(restored.props.source.html).toContain(
      'window.__H5_INITIAL_COUNT__ = 1;',
    );
    renderer.act(() => {
      restored.props.onMessage({
        nativeEvent: {data: '{"count":2,"at":"14:03:20"}'},
      });
    });
    expect(textOf(screen.findByProps({testID: 'web-last-message'}))).toBe(
      '最近一次回传：第 2 次点击 · 14:03:20',
    );

    renderer.act(() => {
      tree!.unmount();
    });
  });

  it('stops at a blocked navigation on a remote page instead of reloading it', () => {
    // The mock counts native WebView mounts, so a remount is distinguishable
    // from a re-render with the same source.
    const mounts = (
      globalThis as unknown as {__dsWebViewMockMounts: {count: number}}
    ).__dsWebViewMockMounts;
    mounts.count = 0;

    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(
        <WebPageScreen onBack={() => {}} url="https://umapp-qr.example.com/" />,
      );
    });
    const screen = tree!.root;
    expect(mounts.count).toBe(1);

    const webView = screen.findByProps({testID: 'web-view'});
    let allowed: boolean | undefined;
    renderer.act(() => {
      allowed = webView.props.onShouldStartLoadWithRequest({
        url: 'tuitui://umapp',
      });
    });

    expect(allowed).toBe(false);
    expect(textOf(screen.findByProps({testID: 'web-blocked'}))).toBe(
      '已拦截非 http(s) 跳转：tuitui://umapp',
    );
    // The page navigates to the app scheme by itself while loading (the 360 QR
    // lander does `location.href = 'tuitui://umapp'`); reloading it would
    // navigate again and blank again, i.e. flicker forever, so the remote
    // document is never remounted.
    expect(mounts.count).toBe(1);

    renderer.act(() => {
      tree!.unmount();
    });
    expect(mounts.count).toBe(0);
  });

  it('opens a scanned http(s) URL instead of the local document', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(
        <WebPageScreen onBack={() => {}} url="https://example.com/scanned" />,
      );
    });
    const screen = tree!.root;
    const webView = screen.findByProps({testID: 'web-view'});
    expect(webView.props.source).toEqual({uri: 'https://example.com/scanned'});
    expect(textOf(screen.findByProps({testID: 'web-address'}))).toBe(
      'https://example.com/scanned',
    );

    renderer.act(() => {
      tree!.unmount();
    });
  });

  it('ignores a non-http(s) url and keeps the local document', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    renderer.act(() => {
      tree = renderer.create(
        <WebPageScreen onBack={() => {}} url="file:///tmp/demo.html" />,
      );
    });
    const screen = tree!.root;
    const webView = screen.findByProps({testID: 'web-view'});
    expect(webView.props.source.uri).toBeUndefined();
    expect(webView.props.source.html).toContain(
      'window.__H5_INITIAL_COUNT__ = 0;',
    );
    expect(textOf(screen.findByProps({testID: 'web-address'}))).toBe(
      'src/web/demo.html · 本地 HTML',
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

