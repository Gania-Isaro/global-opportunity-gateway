import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Empty, LoadError, Loading, PageHeader, formatDateTime, useLoad } from '../components/ui.jsx';

// FR 10.1 In-app notifications, FR 10.3 Mark as read
export default function Notifications() {
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get('/notifications'), []);

  const markRead = async (n) => {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`);
      reload();
      refresh();
    }
  };

  const markAll = async () => {
    await api.post('/notifications/read-all');
    reload();
    refresh();
  };

  return (
    <div className="container narrow">
      <PageHeader
        title="Notifications"
        subtitle="Important updates are also sent to your email."
        actions={data?.unread > 0 && <button className="btn btn-outline" onClick={markAll}>Mark all as read</button>}
      />
      {loading && !data && <Loading />}
      {error && <LoadError error={error} reload={reload} />}
      {data && !data.notifications.length && <Empty title="You have no notifications yet." />}
      <ul className="notif-list">
        {data?.notifications.map((n) => (
          <li key={n.id} className={`card notif ${n.read ? '' : 'unread'}`}>
            <span className="notif-dot" aria-hidden="true" />
            <div className="notif-body">
              <p>{n.message}</p>
              <p className="small muted">{formatDateTime(n.created_at)}{!n.read && <span className="sr-only"> (unread)</span>}</p>
            </div>
            <div className="row-actions">
              {n.link && <Link to={n.link} className="btn btn-outline btn-sm" onClick={() => markRead(n)}>Open</Link>}
              {!n.read && <button className="btn btn-ghost btn-sm" onClick={() => markRead(n)}>Mark as read</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
