import { fail } from './middleware.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Small validator: collects field errors in plain English (Section 3.1)
// and throws a 400 if there are any.
export function validate(body, rules) {
  const errors = {};
  const out = {};
  for (const [field, rule] of Object.entries(rules)) {
    let value = body?.[field];
    if (typeof value === 'string') value = value.trim();
    const empty = value === undefined || value === null || value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (rule.required) errors[field] = rule.message || `${rule.label || field} is required.`;
      else out[field] = rule.default ?? (rule.type === 'list' ? [] : null);
      continue;
    }

    switch (rule.type) {
      case 'email':
        value = String(value).toLowerCase();
        if (!EMAIL_RE.test(value)) errors[field] = 'Enter a valid email address.';
        break;
      case 'password':
        if (String(value).length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
          errors[field] = 'Password must be at least 8 characters and include a letter and a number.';
        }
        break;
      case 'int':
        value = Number(value);
        if (!Number.isInteger(value) || (rule.min !== undefined && value < rule.min) ||
            (rule.max !== undefined && value > rule.max)) {
          errors[field] = `${rule.label || field} must be a whole number between ${rule.min} and ${rule.max}.`;
        }
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
          errors[field] = `${rule.label || field} must be a valid date.`;
        }
        break;
      case 'enum':
        if (!rule.values.includes(value)) errors[field] = `${rule.label || field} is not valid.`;
        break;
      case 'url':
        try {
          const u = new URL(value);
          if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
        } catch {
          errors[field] = 'Enter a full link starting with http:// or https://';
        }
        break;
      case 'list':
        if (typeof value === 'string') value = value.split(',');
        if (!Array.isArray(value)) value = [];
        value = [...new Set(value.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
        break;
      default:
        value = String(value);
    }
    if (rule.max && typeof value === 'string' && value.length > rule.max) {
      errors[field] = `${rule.label || field} must be ${rule.max} characters or fewer.`;
    }
    out[field] = value;
  }
  if (Object.keys(errors).length) fail(400, 'Please fix the highlighted fields.', errors);
  return out;
}

export function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) fail(404, 'Not found.');
  return id;
}

// File types allowed for uploads (Section 5.3).
export const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);
