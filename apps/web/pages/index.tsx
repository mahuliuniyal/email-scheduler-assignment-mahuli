import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type User = { id: string; email: string; name?: string | null };
type Sender = { id: string; email: string; provider: string };
type EmailJob = {
  id: string;
  status: string;
  scheduledFor: string;
  sentAt?: string | null;
  errorLog?: string | null;
  campaign: { id: string; name: string; subjectTemplate: string; bodyTemplate: string; senderAccount?: Sender };
  lead: { email: string; firstName?: string | null; lastName?: string | null };
};

type Stats = { scheduled: number; sent: number; failed: number };

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function parseLeads(text: string) {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes(',') ? ',' : /\s+/.test(lines[0]) ? null : ',';
  const header = delimiter ? lines[0].split(delimiter).map((x) => x.trim().toLowerCase()) : [];
  const hasHeader = header.includes('email');
  const start = hasHeader ? 1 : 0;
  return lines.slice(start).map((line) => {
    if (!delimiter) return { email: line };
    const cells = line.split(delimiter).map((x) => x.trim().replace(/^"|"$/g, ''));
    const emailIndex = hasHeader ? header.indexOf('email') : 0;
    const firstIndex = hasHeader ? header.indexOf('firstname') >= 0 ? header.indexOf('firstname') : header.indexOf('first_name') : 1;
    const lastIndex = hasHeader ? header.indexOf('lastname') >= 0 ? header.indexOf('lastname') : header.indexOf('last_name') : 2;
    return { email: cells[emailIndex] || '', firstName: firstIndex >= 0 ? cells[firstIndex] : undefined, lastName: lastIndex >= 0 ? cells[lastIndex] : undefined };
  }).filter((lead) => /\S+@\S+\.\S+/.test(lead.email));
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'scheduled' | 'sent' | 'compose'>('scheduled');
  const [emails, setEmails] = useState<EmailJob[]>([]);
  const [stats, setStats] = useState<Stats>({ scheduled: 0, sent: 0, failed: 0 });
  const [senders, setSenders] = useState<Sender[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EmailJob | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [campaignName, setCampaignName] = useState('New outreach campaign');
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('Hello {{firstName}}');
  const [body, setBody] = useState('<p>Hi {{firstName}},</p><p>I wanted to reach out regarding...</p>');
  const [hourlyLimit, setHourlyLimit] = useState(50);
  const [minDelay, setMinDelay] = useState(2);
  const [scheduleDate, setScheduleDate] = useState('');
  const [leadText, setLeadText] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);


  useEffect(() => {
    api('/auth/me').then((data) => {
      setUser(data.user);
      return Promise.all([api('/api/sender-accounts'), api('/api/stats')]);
    }).then(async ([s, st]) => {
      setSenders(s);
      setStats(st);
      const list = await api('/api/emails?status=SCHEDULED');
      setEmails(list);
      if (s[0]) setSenderId(s[0].id);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || view === 'compose') return;
    const id = setTimeout(() => {
      api(`/api/emails?status=${view === 'sent' ? 'SENT' : 'SCHEDULED'}${search ? `&q=${encodeURIComponent(search)}` : ''}`)
        .then(setEmails)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(id);
  }, [search, view, user]);

  const title = view === 'compose' ? 'Compose New Email' : view === 'sent' ? 'Sent' : 'Scheduled';
  const senderEmail = useMemo(() => senders.find((s) => s.id === senderId)?.email || '', [senders, senderId]);

  async function createAndSchedule() {
    try {
      setError('');
      setSuccess('');
      const leads = parseLeads(leadText);
      if (!senders.length) throw new Error('Connect Google first to create a sender account.');
      if (!senderId) throw new Error('Select a sender account.');
      if (!leads.length) throw new Error('Upload a CSV or enter at least one valid lead email.');
      const scheduledFor = scheduleDate ? new Date(scheduleDate).toISOString() : new Date().toISOString();
      const campaign = await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: campaignName, senderAccountId: senderId, subjectTemplate: subject, bodyTemplate: body, hourlyLimit, minDelaySeconds: minDelay }) });
      await api('/api/campaigns/schedule', { method: 'POST', body: JSON.stringify({ campaignId: campaign.id, leads, scheduledFor }) });
      setSuccess(`${leads.length} email${leads.length === 1 ? '' : 's'} scheduled.`);
      setLeadText('');
      setView('scheduled');
      setShowSchedule(false);
      const [list, st] = await Promise.all([api('/api/emails?status=SCHEDULED'), api('/api/stats')]);
      setEmails(list); setStats(st);
    } catch (e: any) { setError(e.message || 'Could not schedule emails'); }
  }

  if (loading) return <div className="page-center"><div className="spinner" /></div>;

  if (!user) {
    return <LoginScreen error={error} onDevLogin={async (email) => { const result = await api('/auth/dev-login', { method: 'POST', body: JSON.stringify({ email }) }); setUser(result.user); }} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ONE</div>
        <div className="profile-card"><div className="avatar">{(user.name || user.email)[0].toUpperCase()}</div><div><strong>{user.name || 'User'}</strong><span>{user.email}</span></div></div>
        <button className="compose-pill" onClick={() => setView('compose')}>+ Compose</button>
        <nav className="nav-list">
          <button className={view === 'scheduled' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('scheduled'); setSelected(null); }}><span>◷</span> Scheduled <b>{stats.scheduled}</b></button>
          <button className={view === 'sent' ? 'nav-item active' : 'nav-item'} onClick={() => { setView('sent'); setSelected(null); }}><span>✓</span> Sent <b>{stats.sent}</b></button>
        </nav>
        <div className="sidebar-bottom">
          <a href={`${API}/auth/slack`} className="connect-link">Connect Slack</a>
          <a href={`${API}/admin/queues`} target="_blank" rel="noreferrer" className="connect-link">BullMQ Dashboard ↗</a>
          <button className="logout" onClick={async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); }}>Log out</button>
        </div>
      </aside>

      <main className="main-panel">
        {view !== 'compose' && <header className="topbar"><div className="search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emails, subjects or recipients" /></div><div className="top-stats"><span>{stats.failed} failed</span></div></header>}

        {view === 'compose' ? (
          <ComposeScreen senderEmail={senderEmail} senders={senders} senderId={senderId} setSenderId={setSenderId} campaignName={campaignName} setCampaignName={setCampaignName} subject={subject} setSubject={setSubject} body={body} setBody={setBody} hourlyLimit={hourlyLimit} setHourlyLimit={setHourlyLimit} minDelay={minDelay} setMinDelay={setMinDelay} leadText={leadText} setLeadText={setLeadText} scheduleDate={scheduleDate} setScheduleDate={setScheduleDate} showSchedule={showSchedule} setShowSchedule={setShowSchedule} onSend={createAndSchedule} onBack={() => setView('scheduled')} />
        ) : (
          <section className="content">
            <div className="section-heading"><div><p className="eyebrow">OUTBOX</p><h1>{title}</h1></div><button className="small-primary" onClick={() => setView('compose')}>New email</button></div>
            {success && <div className="toast success">{success}</div>}
            {error && <div className="toast error">{error}</div>}
            <div className="email-list">
              {emails.length === 0 ? <div className="empty-state"><div className="empty-icon">✉</div><h3>No emails here yet</h3><p>Compose a campaign and scheduled messages will appear here.</p></div> : emails.map((email) => (
                <button className="email-row" key={email.id} onClick={() => setSelected(email)}>
                  <div className="email-avatar">{(email.lead.firstName || email.lead.email)[0].toUpperCase()}</div>
                  <div className="email-copy"><strong>{email.lead.firstName ? `${email.lead.firstName} ${email.lead.lastName || ''}` : email.lead.email}</strong><span>{email.campaign.subjectTemplate}</span><small>{email.lead.email}</small></div>
                  <div className="email-meta"><span className={email.status === 'SENT' ? 'badge green' : 'badge orange'}>{email.status === 'SENT' ? 'Sent' : timeLabel(email.scheduledFor)}</span><span className="badge gray">{email.status}</span></div>
                </button>
              ))}
            </div>
          </section>
        )}

        {selected && <EmailDetail email={selected} onClose={() => setSelected(null)} />}
      </main>
    </div>
  );
}

function LoginScreen({ error, onDevLogin }: { error: string; onDevLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [showDev, setShowDev] = useState(false);
  return <div className="login-page"><div className="login-card"><div className="login-mark">ONE</div><h1>Welcome back</h1><p className="muted">Connect your Google account to manage your outreach.</p><a className="google-btn" href={`${API}/auth/google`}><span className="google-g">G</span> Login with Google</a><div className="divider"><span>or continue with email</span></div><input className="field" placeholder="Email ID" value={email} onChange={(e) => setEmail(e.target.value)} /><input className="field" type="password" placeholder="Password" disabled /><button className="login-btn" onClick={() => setShowDev(true)}>Login</button>{showDev && <button className="dev-btn" onClick={() => email && onDevLogin(email)}>Use local demo login</button>}{error && <p className="form-error">{error}</p>}<p className="login-foot">Google OAuth is the production sign-in method.</p></div></div>;
}

function ComposeScreen(props: any) {
  return <section className="compose-screen"><div className="compose-header"><button className="back-link" onClick={props.onBack}>← Compose New Email</button><div className="compose-actions"><button className="ghost-btn" onClick={() => props.setShowSchedule(true)}>Send Later</button><button className="primary-btn" onClick={props.onSend}>Schedule Send</button></div></div><div className="compose-grid"><div className="compose-card"><div className="compose-form-row"><label>From<select value={props.senderId} onChange={(e) => props.setSenderId(e.target.value)}>{props.senders.length ? props.senders.map((s: Sender) => <option key={s.id} value={s.id}>{s.email}</option>) : <option value="">Connect Google first</option>}</select></label><label>Campaign<input value={props.campaignName} onChange={(e) => props.setCampaignName(e.target.value)} /></label></div><label>Subject<input value={props.subject} onChange={(e) => props.setSubject(e.target.value)} /></label><div className="editor-toolbar"><button onClick={() => props.setBody((v: string) => `${v}<strong>bold</strong>`)}>B</button><button onClick={() => props.setBody((v: string) => `${v}<em>italic</em>`)}>I</button><button onClick={() => props.setBody((v: string) => `${v}<ul><li>List item</li></ul>`)}>•</button></div><textarea className="editor" value={props.body.replace(/<[^>]+>/g, '')} onChange={(e) => props.setBody(e.target.value)} placeholder="Type Your Reply..." /><div className="lead-upload"><div><strong>Lead list</strong><span>{props.leadText ? `${parseLeads(props.leadText).length} leads detected` : 'CSV, email-per-line or simple text'}</span></div><label className="upload-link">+ Upload List<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { const file = e.target.files?.[0]; if (file) file.text().then(props.setLeadText); }} /></label></div><textarea className="lead-text" value={props.leadText} onChange={(e) => props.setLeadText(e.target.value)} placeholder={'alice@example.com\nbob@example.com'} /></div><aside className="settings-card"><p className="eyebrow">DELIVERY</p><h3>Sending controls</h3><label>Delay between 2 emails<input type="number" min="0" value={props.minDelay} onChange={(e) => props.setMinDelay(Number(e.target.value))} /></label><label>Hourly Limit<input type="number" min="1" value={props.hourlyLimit} onChange={(e) => props.setHourlyLimit(Number(e.target.value))} /></label><div className="info-box"><strong>From</strong><span>{props.senderEmail || 'Select a sender'}</span></div><div className="info-box"><strong>Schedule</strong><span>{props.scheduleDate ? new Date(props.scheduleDate).toLocaleString() : 'Send now'}</span></div></aside></div>{props.showSchedule && <div className="modal-backdrop"><div className="schedule-modal"><button className="modal-close" onClick={() => props.setShowSchedule(false)}>×</button><p className="eyebrow">SEND LATER</p><h2>Pick date & time</h2><input className="field" type="datetime-local" value={props.scheduleDate} onChange={(e) => props.setScheduleDate(e.target.value)} /><div className="quick-times"><button onClick={() => props.setScheduleDate(nextTime(1))}>Tomorrow, 10:00 AM</button><button onClick={() => props.setScheduleDate(nextTime(2))}>Tomorrow, 2:00 PM</button><button onClick={() => props.setScheduleDate(nextTime(3))}>In 1 hour</button></div><div className="modal-actions"><button className="ghost-btn" onClick={() => props.setShowSchedule(false)}>Cancel</button><button className="primary-btn" onClick={() => props.setShowSchedule(false)}>Done</button></div></div></div>}</section>;
}

function nextTime(kind: number) { const d = new Date(); if (kind === 3) d.setHours(d.getHours() + 1); else { d.setDate(d.getDate() + 1); d.setHours(kind === 1 ? 10 : 14, 0, 0, 0); } return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }

function EmailDetail({ email, onClose }: { email: EmailJob; onClose: () => void }) { return <div className="detail-panel"><button className="back-link" onClick={onClose}>← Back</button><div className="detail-head"><div className="email-avatar large">{(email.lead.firstName || email.lead.email)[0].toUpperCase()}</div><div><h2>{email.campaign.subjectTemplate}</h2><span>{email.lead.email} · {timeLabel(email.scheduledFor)}</span></div></div><div className="detail-body" dangerouslySetInnerHTML={{ __html: email.campaign.bodyTemplate.replace(/\{\{\s*firstName\s*\}\}/gi, email.lead.firstName || '') }} /><div className="detail-callout">Status: <strong>{email.status}</strong></div></div>; }
