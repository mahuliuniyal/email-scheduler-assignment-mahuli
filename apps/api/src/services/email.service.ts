import nodemailer from 'nodemailer';
import type { TestAccount, Transporter } from 'nodemailer';
import { config } from '../config';

let transporterPromise: Promise<Transporter> | null = null;
let etherealAccount: TestAccount | null = null;
let lastPreviewUrl = '';

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (config.SMTP_USER && config.SMTP_PASS) {
    transporterPromise = Promise.resolve(nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    }));
  } else {
    etherealAccount = await nodemailer.createTestAccount();
    transporterPromise = Promise.resolve(nodemailer.createTransport({
      host: etherealAccount.smtp.host,
      port: etherealAccount.smtp.port,
      secure: etherealAccount.smtp.secure,
      auth: { user: etherealAccount.user, pass: etherealAccount.pass },
    }));
  }

  return transporterPromise;
}

export const EmailService = {
  async sendEmail(to: string, subject: string, html: string) {
    const transporter = await getTransporter();
    const from = config.SMTP_USER || etherealAccount?.user || 'no-reply@example.com';
    const info = await transporter.sendMail({ from, to, subject, html });
    lastPreviewUrl = nodemailer.getTestMessageUrl(info) || '';
    return info;
  },

  get lastPreviewUrl() {
    return lastPreviewUrl;
  },
};
