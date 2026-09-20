import { describe, expect, it } from 'vitest';
import { esc } from './components';

describe('HTML escaping', () => {
  it('neutralizes spreadsheet-controlled markup before it enters tooltip HTML', () => {
    expect(esc('<img src=x onerror="alert(1)">&\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;',
    );
  });
});
