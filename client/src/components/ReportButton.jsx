import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, Modal, useSubmit } from './ui.jsx';

// FR 12.3 Report a challenge or an account for review by an administrator
export default function ReportButton({ targetType, targetId, label }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(null);
  const { busy, error, fields, submit } = useSubmit();

  const close = () => {
    setOpen(false);
    setReason('');
    setDone(null);
  };

  const send = (e) => {
    e.preventDefault();
    submit(async () => {
      const r = await api.post('/reports', { target_type: targetType, target_id: targetId, reason });
      setDone(r.message);
    });
  };

  return (
    <>
      <button className="link-btn danger-link" onClick={() => setOpen(true)}>
        {label || `Report this ${targetType}`}
      </button>
      {open && (
        <Modal title={`Report this ${targetType}`} onClose={close}>
          {done ? (
            <>
              <Alert type="success">{done}</Alert>
              <button className="btn btn-primary" onClick={close}>Close</button>
            </>
          ) : (
            <form onSubmit={send} noValidate>
              <p className="muted">Tell the GOG team what is wrong. For example: asking participants for payment, misleading details or abusive content.</p>
              <Alert>{error}</Alert>
              <Field label="Reason" error={fields.reason} required>
                {(p) => <textarea {...p} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />}
              </Field>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
                <button className="btn btn-danger" disabled={busy}>{busy ? 'Sending...' : 'Send report'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
