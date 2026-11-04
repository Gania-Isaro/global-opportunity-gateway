import { one, query } from './db.js';
import { sendEmail } from './mailer.js';
import { config } from './config.js';

// High priority events also go out by email (FR 10.2).
const EMAIL_TYPES = new Set([
  'verification_decision',
  'new_application',
  'application_decision',
  'invitation',
]);

export async function notify(userId, type, message, link = null) {
  await query(
    'INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4)',
    [userId, type, message, link]
  );
  if (EMAIL_TYPES.has(type)) {
    const user = await one('SELECT email FROM users WHERE id = $1', [userId]);
    if (user) {
      const url = link ? `\n\nOpen it here: ${config.appUrl}${link}` : '';
      await sendEmail(user.email, 'GOG notification', `${message}${url}\n\nGOG (Global Opportunity Gateway)`);
    }
  }
}

// Writes an entry to the audit log (FR 12.4, BR 10). The log is never edited.
export async function audit(adminId, action, targetType, targetId, details = null) {
  await query(
    'INSERT INTO audit_log (admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5)',
    [adminId, action, targetType, targetId, details]
  );
}
