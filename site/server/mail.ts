import { createTransport } from 'nodemailer';
import { config } from './config.ts';

const transport = config.smtpUrl ? createTransport(config.smtpUrl) : undefined;

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
