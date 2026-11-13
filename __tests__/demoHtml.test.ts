/**
 * `src/web/demoHtml.ts` is generated from `src/web/demo.html` because Metro
 * 0.72 cannot import an `.html` module. This test fails when someone edits one
 * file without regenerating the other.
 *
 * @format
 */

import {describe, expect, it} from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {DEMO_HTML} from '../src/web/demoHtml';

describe('demo HTML mirror', () => {
  it('matches src/web/demo.html', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'web', 'demo.html'),
      'utf8',
    );

    expect(DEMO_HTML).toBe(html);
  });
});
