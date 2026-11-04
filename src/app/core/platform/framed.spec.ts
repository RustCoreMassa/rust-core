import { isFramed, showFramedNotice } from './framed';

describe('framed', () => {
  it('runs normally in its own tab', () => {
    expect(isFramed()).toBe(false);
  });

  it('sees another site around it', () => {
    const win = { self: {}, top: {} } as unknown as Window;
    expect(isFramed(win)).toBe(true);
    const throwing = {
      self: {},
      get top(): Window {
        throw new Error('blocked');
      },
    } as unknown as Window;
    expect(isFramed(throwing)).toBe(true);
  });

  it('replaces the page with a link to its own tab, as text', () => {
    const doc = document.implementation.createHTMLDocument('x');
    doc.body.innerHTML = '<app-root></app-root>';
    showFramedNotice(doc);
    expect(doc.querySelector('app-root')).toBeNull();
    const link = doc.querySelector('a')!;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(doc.body.textContent).toContain("doesn't run inside another website");
  });
});
