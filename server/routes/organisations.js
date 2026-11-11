import { Router } from 'express';
import { one, many, tx } from '../db.js';
import { fail, requireAuth, requireVerified } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { acceptFiles } from '../uploads.js';
import { notify } from '../notify.js';

const router = Router();

// FR 3.1 Submit organisation details. FR 3.2 New organisations start as pending.
router.post('/organisations', requireVerified, acceptFiles('documents', 5), async (req, res) => {
  const d = validate(req.body, {
    name: { required: true, label: 'Organisation name', max: 160 },
    sector: { required: true, label: 'Sector', max: 80 },
    description: { required: true, label: 'Description', max: 2000 },
    contact_person: { required: true, label: 'Contact person', max: 120 },
  });
  const existing = await one('SELECT id, status FROM organisations WHERE rep_user_id = $1', [req.user.id]);
  if (existing && existing.status !== 'rejected') fail(400, 'You have already registered an organisation.');

  const org = await tx(async (c) => {
    let row;
    if (existing) {
      // A rejected organisation can be corrected and submitted again.
      ({ rows: [row] } = await c.query(
        `UPDATE organisations SET name=$2, sector=$3, description=$4, contact_person=$5,
                status='pending', rejection_reason=NULL, reviewed_at=NULL, created_at=now()
          WHERE id=$1 RETURNING *`,
        [existing.id, d.name, d.sector, d.description, d.contact_person]
      ));
    } else {
      ({ rows: [row] } = await c.query(
        `INSERT INTO organisations (rep_user_id, name, sector, description, contact_person)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.user.id, d.name, d.sector, d.description, d.contact_person]
      ));
    }
    for (const f of req.files || []) {
      await c.query(
        'INSERT INTO organisation_documents (org_id, filename, mime, size, data) VALUES ($1,$2,$3,$4,$5)',
        [row.id, f.originalname, f.mimetype, f.size, f.buffer]
      );
    }
    return row;
  });

  const admins = await many("SELECT id FROM users WHERE role = 'admin'");
  for (const a of admins) {
    await notify(a.id, 'org_submitted', `${org.name} is waiting for verification.`, '/admin/organisations');
  }
  res.status(201).json({ message: 'Organisation submitted. An administrator will review it.', organisation: org });
});

