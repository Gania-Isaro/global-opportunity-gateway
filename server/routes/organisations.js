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

router.get('/organisations/mine', requireAuth, async (req, res) => {
  const org = await one('SELECT * FROM organisations WHERE rep_user_id = $1', [req.user.id]);
  const documents = org
    ? await many('SELECT id, filename, mime, size, created_at FROM organisation_documents WHERE org_id = $1', [org.id])
    : [];
  res.json({ organisation: org, documents });
});

// Public organisation page with the Verified badge (FR 3.4).
router.get('/organisations/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const org = await one(
    'SELECT id, name, sector, description, status, created_at FROM organisations WHERE id = $1',
    [id]
  );
  if (!org) fail(404, 'Organisation not found.');
  const challenges = await many(
    `SELECT id, title, sector, deadline, status FROM challenges
      WHERE org_id = $1 AND status IN ('published', 'closed') ORDER BY created_at DESC`,
    [id]
  );
  res.json({ organisation: { ...org, verified: org.status === 'verified' }, challenges });
});

// Supporting documents are visible to the representative and administrators only.
router.get('/organisations/:id/documents/:docId', requireAuth, async (req, res) => {
  const org = await one('SELECT rep_user_id FROM organisations WHERE id = $1', [idParam(req.params.id)]);
  if (!org) fail(404, 'Not found.');
  if (req.user.role !== 'admin' && org.rep_user_id !== req.user.id) fail(403, 'You do not have permission to do that.');
  const doc = await one(
    'SELECT filename, mime, data FROM organisation_documents WHERE id = $1 AND org_id = $2',
    [idParam(req.params.docId), idParam(req.params.id)]
  );
  if (!doc) fail(404, 'Document not found.');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
  res.send(doc.data);
});

export default router;
