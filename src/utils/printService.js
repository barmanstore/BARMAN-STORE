export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const printHtmlDocument = ({
  title = 'Print',
  bodyHtml = '',
  cssText = '',
  width = 980,
  height = 760,
  onError = null,
  autoClose = false,
} = {}) => {
  const win = window.open('about:blank', '_blank', `width=${width},height=${height}`);
  if (!win) {
    if (typeof onError === 'function') onError('Popup blocked. Please allow popups to print.');
    return false;
  }

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          ${cssText || ''}
        </style>
      </head>
      <body>${bodyHtml || ''}</body>
    </html>
  `;

  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (_) {
    if (typeof onError === 'function') onError('Failed to prepare print window. Please try again.');
    return false;
  }

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
      if (autoClose) {
        win.onafterprint = () => {
          try { win.close(); } catch (_) {}
        };
      }
    } catch (_) {
      if (typeof onError === 'function') onError('Print failed. Please use browser print from the opened page.');
    }
  };

  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 250);
    return true;
  }
  win.onload = () => setTimeout(triggerPrint, 250);
  return true;
};

