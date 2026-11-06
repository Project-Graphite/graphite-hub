import { createTransport } from 'nodemailer';
import { config } from './config.ts';

const transport = config.smtpUrl ? createTransport(config.smtpUrl) : undefined;

export interface Outgoing {
  from: { name: string };
  replyTo: string | null;
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string | null;
}

export async function sendEmail(message: Outgoing) {
  if (!transport || !config.alertsFrom) {
    throw new Error(transport ? 'ALERTS_FROM is not set' : 'SMTP_URL is not set');
  }
  const info = await transport.sendMail({
    from: { name: message.from.name, address: config.alertsFrom },
    replyTo: message.replyTo ?? undefined,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    headers: message.unsubscribeUrl
      ? {
          'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          Precedence: 'bulk',
        }
      : undefined,
  });
  if (info.rejected.length > 0) {
    throw Object.assign(new Error(`Rejected: ${info.response}`), {
      code: 'EENVELOPE',
      responseCode: 550,
      permanent: true,
    });
  }
  return info.messageId;
}

export async function alertOwner(subject: string, text: string) {
  if (!transport || !config.alertsEmail) {
    return false;
  }
  await transport.sendMail({
    from: config.alertsFrom ?? config.alertsEmail,
    to: config.alertsEmail,
    subject,
    text,
  });
  return true;
}
