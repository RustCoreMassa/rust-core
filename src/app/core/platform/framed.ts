/**
 * Clickjacking guard. The Content-Security-Policy's `frame-ancestors` doesn't work from a
 * <meta> tag (and DeWeb can't send headers), so the app checks it itself: inside another
 * site's frame it doesn't start, and offers to open itself in its own tab instead.
 */
export function isFramed(win: Window = window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true; // reading `top` throws in some sandboxes: framed anyway
  }
}

/** Replaces the page with a short notice and a link to the app in its own tab (no innerHTML). */
export function showFramedNotice(doc: Document = document): void {
  const box = doc.createElement('main');
  box.style.cssText =
    'max-width:480px;margin:15vh auto;padding:24px;font:16px/1.6 system-ui,sans-serif;color:#f6f6f8';
  const title = doc.createElement('h1');
  title.textContent = 'RustCore Launchpad';
  const text = doc.createElement('p');
  text.textContent =
    "For your safety, the Launchpad doesn't run inside another website. Open it in its own tab:";
  const link = doc.createElement('a');
  link.href = doc.URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open RustCore Launchpad';
  link.style.color = '#ff2d42';
  box.append(title, text, link);
  doc.body.replaceChildren(box);
}
