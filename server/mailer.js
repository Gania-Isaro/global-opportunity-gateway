import nodemailer from 'nodemailer';
import { config } from './config.js';
import { query } from './db.js';

let transport = null;
if (config.smtp.host && config.smtp.user) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port !== 465, // encrypted connection (Section 3.4)
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

export const emailEnabled = Boolean(transport);

// Every email is recorded in email_outbox. If SMTP is configured it is also
// delivered; otherwise it is printed to the server log.
export async function sendEmail(to, subject, body) {
  let delivered = false;
  if (transport) {
    try {
      await transport.sendMail({ from: config.smtp.from, to, subject, text: body });
      delivered = true;
    } catch (err) {
      console.error('[mail] failed to send to', to, err.message);
    }
  } else {
    console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}\n${body}\n`);
  }
  await query(
    'INSERT INTO email_outbox (to_email, subject, body, delivered) VALUES ($1, $2, $3, $4)',
    [to, subject, body, delivered]
  );
}
