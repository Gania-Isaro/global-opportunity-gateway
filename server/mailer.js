import nodemailer from 'nodemailer';
import { config } from './config.js';
import { query } from './db.js';

let transport = null;
if (!config.brevo.apiKey && config.smtp.host && config.smtp.user) {
  transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port !== 465, // encrypted connection (Section 3.4)
    auth: { user: config.smtp.user, pass: config.smtp.pass },
    // A slow mail server must not hold up signup.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
}

export const emailMode = config.brevo.apiKey ? 'brevo' : transport ? 'smtp' : 'log';
export const emailEnabled = emailMode !== 'log';

// Turns "GOG <hello@example.com>" into the sender object Brevo expects.
export function parseSender(value) {
  const match = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  return match ? { name: match[1] || 'GOG', email: match[2] } : { name: 'GOG', email: value.trim() };
}

async function sendWithBrevo(to, subject, body) {
  const res = await fetch(config.brevo.url, {
    method: 'POST',
    headers: { 'api-key': config.brevo.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: parseSender(config.smtp.from), to: [{ email: to }], subject, textContent: body }),
    signal: AbortSignal.timeout(10000), // a slow provider must not hold up signup
  });
  if (!res.ok) throw new Error(`Brevo returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Every email is recorded in email_outbox. If Brevo or SMTP is configured it is
// also delivered; otherwise it is printed to the server log.
export async function sendEmail(to, subject, body) {
  let delivered = false;
  if (emailEnabled) {
    try {
      if (emailMode === 'brevo') await sendWithBrevo(to, subject, body);
      else await transport.sendMail({ from: config.smtp.from, to, subject, text: body });
      delivered = true;
    } catch (err) {
      console.error('[mail] failed to send to', to, err.message);
    }
  } else {
    console.log(`[mail] To: ${to}\n[mail] Subject: ${subject}\n${body}\n`);
  }
  try {
    await query(
      'INSERT INTO email_outbox (to_email, subject, body, delivered) VALUES ($1, $2, $3, $4)',
      [to, subject, body, delivered]
    );
  } catch (err) {
    console.error('[mail] could not record the email', err.message);
  }
  return delivered;
}
