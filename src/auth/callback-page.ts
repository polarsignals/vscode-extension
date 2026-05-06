function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCallbackPage(
  state: 'success' | 'error',
  logoSvg: string,
  message?: string,
): string {
  const isSuccess = state === 'success';
  const title = isSuccess ? 'Login successful' : 'Authentication failed';
  const heading = isSuccess ? 'Return to your editor' : 'Something went wrong';
  const subtitle = isSuccess
    ? 'You may close this tab now'
    : message
      ? escapeHtml(message)
      : 'You may close this tab and try again from the editor';
  const badgeIcon = isSuccess
    ? '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    : '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  const badgeClass = isSuccess ? 'success' : 'error';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Polar Signals</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; }
  body {
    background: #ffffff;
    color: #000000;
    font-family: "Dazzed", "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-weight: 500;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    min-height: 100vh;
    overflow: hidden;
  }
  .header {
    position: absolute;
    top: 32px;
    left: 40px;
    display: flex;
    align-items: center;
  }
  .header svg {
    height: 26px;
    width: auto;
    fill: #000000;
    display: block;
  }
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 0 24px;
    text-align: center;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px 6px 12px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 28px;
  }
  .badge svg { width: 16px; height: 16px; flex-shrink: 0; }
  .badge-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .badge.success {
    background: #F0F0FF;
    color: #000000;
    padding: 4px 16px 4px 4px;
    gap: 10px;
  }
  .badge.success .badge-icon {
    width: 24px;
    height: 24px;
    background: #726AFF;
    color: #ffffff;
    border-radius: 999px;
  }
  .badge.success .badge-icon svg { width: 14px; height: 14px; }
  .badge.error {
    background: #FFECE7;
    color: #C73E27;
  }
  .heading {
    font-size: clamp(40px, 6.5vw, 64px);
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.05;
    margin: 0 0 16px;
    color: #000000;
  }
  .subtitle {
    font-size: 16px;
    font-weight: 500;
    color: #6b6f76;
    margin: 0 0 60px;
    max-width: 520px;
  }
  .mock {
    width: 100%;
    max-width: 460px;
    background: #000000;
    border-radius: 14px;
    padding: 18px 22px 28px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
    text-align: left;
  }
  .lights { display: flex; gap: 7px; margin-bottom: 22px; }
  .lights span {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #2a2a2a;
  }
  .line {
    height: 8px;
    background: #2a2a2a;
    border-radius: 4px;
    margin-bottom: 9px;
  }
  .line.l1 { width: 88%; }
  .line.l2 { width: 32%; margin-top: 14px; }
  .line.l3 { width: 65%; }
  .line.l4 { width: 76%; }
  .line.l5 { width: 60%; }
  .line.l6 { width: 36%; margin-top: 14px; }
  .prompt {
    margin-top: 14px;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 15px;
    color: #ffffff;
  }
</style>
</head>
<body>
  <div class="header" role="img" aria-label="Polar Signals">${logoSvg}</div>
  <main class="container">
    <div class="badge ${badgeClass}">
      <span class="badge-icon"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true">${badgeIcon}</svg></span>
      ${title}
    </div>
    <h1 class="heading">${heading}</h1>
    <p class="subtitle">${subtitle}</p>
    <div class="mock" aria-hidden="true">
      <div class="lights"><span></span><span></span><span></span></div>
      <div class="line l1"></div>
      <div class="line l2"></div>
      <div class="line l3"></div>
      <div class="line l4"></div>
      <div class="line l5"></div>
      <div class="line l6"></div>
      <div class="prompt">&gt;_</div>
    </div>
  </main>
</body>
</html>`;
}
