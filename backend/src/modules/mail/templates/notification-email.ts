import { escapeHtml } from '../../../common/utils/escape-html.util';

export interface NotificationEmailContent {
  recipientName: string;
  title: string;
  body: string;
  /** Absolute link for the call-to-action button; the button is omitted without one. */
  actionUrl?: string;
  actionLabel?: string;
}

/**
 * Email copy of an in-app notification. Table layout and inline styles,
 * because many mail clients ignore <style> blocks and modern CSS.
 */
export function renderNotificationEmail(content: NotificationEmailContent): string {
  const firstName = content.recipientName.trim().split(/\s+/)[0] || 'there';
  const button =
    content.actionUrl && content.actionLabel
      ? `<tr><td style="padding:8px 32px 24px">
          <a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;background:#1e59cd;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">${escapeHtml(content.actionLabel)}</a>
        </td></tr>`
      : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
          <tr><td style="padding:20px 32px;border-bottom:1px solid #e4e4e7;font-size:20px;font-weight:700;letter-spacing:1px">BODA</td></tr>
          <tr><td style="padding:24px 32px 8px;font-size:14px;color:#52525b">Hi ${escapeHtml(firstName)},</td></tr>
          <tr><td style="padding:0 32px 8px;font-size:18px;font-weight:600">${escapeHtml(content.title)}</td></tr>
          <tr><td style="padding:0 32px 16px;font-size:15px;line-height:1.5">${escapeHtml(content.body)}</td></tr>
          ${button}
          <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.5;color:#71717a">
            You're getting this email because of activity on your BODA account. You'll also find it under the bell icon in the app.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
