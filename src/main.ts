import './styles.css';

type Role = 'coordinator' | 'guide' | 'student';
type User = { id: string; name: string; email: string; role: Role; domain?: string };
type Team = { id: string; domain: string; guideId: string; members: string[]; created: string };
type Submission = { id: string; teamId: string; studentId: string; kind: string; title: string; date: string; description: string; status: 'Submitted' | 'Reviewed' };
type Diary = { id: string; studentId: string; date: string; title: string; entry: string };
type Remark = { id: string; teamId: string; guideId: string; kind: string; text: string; rating: number; date: string };
type Attendance = { id: string; studentId: string; date: string; status: 'Present' | 'Absent' | 'Leave' };
type AppData = { users: User[]; teams: Team[]; submissions: Submission[]; diaries: Diary[]; remarks: Remark[]; attendance: Attendance[] };
type Page = 'overview' | 'students' | 'guides' | 'teams' | 'reviews' | 'attendance' | 'my-teams' | 'work' | 'feedback' | 'contribute' | 'diary' | 'my-feedback';

let data: AppData = { users: [], teams: [], submissions: [], diaries: [], remarks: [], attendance: [] };
let currentUser: User | null = null;
let page: Page = 'overview';
let toastTimer = 0;
let authToken = sessionStorage.getItem('campus-projects-token');
const root = document.querySelector<HTMLDivElement>('#app')!;
const domains = ['Artificial Intelligence', 'Cloud Computing', 'IoT', 'Web Development', 'Blockchain', 'Mobile Development', 'Cybersecurity', 'Data Science'];
const today = () => new Date().toISOString().slice(0, 10);
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.');
  return result;
}
async function syncData() { data = await api<AppData>('/api/state'); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'The request could not be completed.'; }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const byId = (id: string) => data.users.find(u => u.id === id);
const teamName = (id: string) => id || '—';
const initials = (name: string) => name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const icon = (name: string) => ({ overview: '◫', students: '♧', guides: '♙', teams: '◈', reviews: '▤', attendance: '✓', 'my-teams': '◈', work: '▧', feedback: '✦', contribute: '↑', diary: '▤', 'my-feedback': '✦' } as Record<string, string>)[name] ?? '◦';

function notify(message: string, tone = 'success') {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.className = `toast toast-${tone} visible`; el.textContent = message;
  window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el?.classList.remove('visible'), 2800);
}
function metric(label: string, value: string | number, note: string, tone: string, symbol: string) {
  return `<article class="metric"><div class="metric-top"><span>${label}</span><span class="metric-icon ${tone}">${symbol}</span></div><strong>${value}</strong><small>${note}</small></article>`;
}
function empty(message: string, hint = 'When something is added, it will show up here.') { return `<div class="empty"><span class="empty-mark">◇</span><strong>${message}</strong><p>${hint}</p></div>`; }
function table(headers: string[], rows: string, emptyMessage: string) {
  return rows ? `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : empty(emptyMessage);
}
function rowCells(cells: string[]) { return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`; }
function badge(text: string, kind = 'neutral') { return `<span class="badge ${kind}"><i></i>${esc(text)}</span>`; }
function personCell(user: User) { return `<span class="person"><span class="avatar">${esc(initials(user.name))}</span><span><b>${esc(user.name)}</b><small>${esc(user.id)}</small></span></span>`; }
function field(label: string, name: string, type = 'text', placeholder = '', required = true) {
  return `<label class="field"><span>${label}${required ? '<em>*</em>' : ''}</span><input name="${name}" type="${type}" placeholder="${placeholder}" ${required ? 'required' : ''} ${type === 'date' ? `value="${today()}"` : ''}></label>`;
}
function selectField(label: string, name: string, options: string[], required = true) {
  return `<label class="field"><span>${label}${required ? '<em>*</em>' : ''}</span><select name="${name}" ${required ? 'required' : ''}>${options.map((o, i) => `<option value="${esc(o)}" ${!i ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
}
function textareaField(label: string, name: string, placeholder: string) {
  return `<label class="field full"><span>${label}<em>*</em></span><textarea name="${name}" placeholder="${placeholder}" required></textarea></label>`;
}
function formCard(title: string, hint: string, contents: string, action: string, button: string) {
  return `<section class="panel form-panel"><div class="panel-heading"><div><h2>${title}</h2><p>${hint}</p></div></div><form data-form="${action}"><div class="form-grid">${contents}</div><div class="form-actions"><button class="button primary" type="submit">${button}<span>→</span></button></div></form></section>`;
}
function pageIntro(title: string, desc: string, action?: string, label?: string) {
  return `<div class="page-intro"><div><div class="eyebrow">${esc(currentUser?.role)} workspace</div><h1>${title}</h1><p>${desc}</p></div>${action ? `<button class="button primary" data-go="${action}">${label}<span>＋</span></button>` : ''}</div>`;
}
const roleNav: Record<Role, [Page, string, string][]> = {
  coordinator: [['overview', 'Overview', ''], ['students', 'Students', 'People'], ['guides', 'Guides', 'People'], ['teams', 'Project teams', 'Workspace'], ['reviews', 'Reviews & reports', 'Workspace'], ['attendance', 'Attendance', 'Workspace']],
  guide: [['overview', 'Overview', ''], ['my-teams', 'My teams', 'Mentoring'], ['work', 'Review work', 'Mentoring'], ['feedback', 'Give feedback', 'Mentoring'], ['attendance', 'Attendance', 'Mentoring']],
  student: [['overview', 'Overview', ''], ['contribute', 'Contribute work', 'My project'], ['diary', 'Project diary', 'My project'], ['my-feedback', 'Feedback & attendance', 'My project']],
};
const pageTitles: Record<Page, string> = { overview: 'Overview', students: 'Students', guides: 'Project guides', teams: 'Project teams', reviews: 'Reviews & reports', attendance: 'Attendance', 'my-teams': 'My teams', work: 'Review work', feedback: 'Give feedback', contribute: 'Contribute work', diary: 'Project diary', 'my-feedback': 'Feedback & attendance' };

function loginView() {
  return `<main class="login-shell"><section class="login-art"><div class="brand brand-light"><span class="brand-mark">c</span><span>campus<span class="brand-dot">.</span></span></div><div class="art-copy"><span class="eyebrow">YOUR PROJECT, IN FOCUS</span><h1>Good work<br>grows together.</h1><p>One calm space to keep your team moving, your ideas organized, and your next milestone in sight.</p></div></section><section class="login-main"><div class="login-card"><div class="mobile-brand brand"><span class="brand-mark">c</span><span>campus<span class="brand-dot">.</span></span></div><div class="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p class="login-desc">Choose your role and enter your campus credentials.</p><form data-form="login"><label class="field"><span>Workspace</span><select name="role"><option value="coordinator">Project coordinator</option><option value="guide">Faculty guide</option><option value="student">Student</option></select></label>${field('Campus ID', 'id', 'text', 'e.g. STU001')}${field('Password', 'password', 'password', 'Enter your password')}<button class="button primary login-button" type="submit">Sign in <span>→</span></button></form><div class="demo-box"><span class="demo-icon">✦</span><div><strong>Demo access</strong><p>Coordinator: COORD001 / admin123<br>Guide: GUIDE001 / guide123<br>Student: STU001 / student123</p></div></div><small class="login-note">Your project workspace, all in one place.</small></div></section></main>`;
}

function shell(content: string) {
  const role = currentUser!.role;
  const nav = roleNav[role];
  let section = '';
  return `<div class="app-shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">c</span><span>campus<span class="brand-dot">.</span></span></div><div class="workspace-label">NORTHSTAR UNIVERSITY <span>⌄</span></div><nav>${nav.map(([key, label, group]) => { const divider = group && group !== section ? `<div class="nav-label">${group}</div>` : ''; section = group; return `${divider}<button class="nav-link ${page === key ? 'active' : ''}" data-page="${key}"><span class="nav-icon">${icon(key)}</span>${label}${key === 'work' && role === 'guide' ? `<small class="nav-count">${data.submissions.filter(s => s.status === 'Submitted').length}</small>` : ''}</button>`; }).join('')}</nav><div class="sidebar-bottom"><div class="help-card"><span class="help-spark">✳</span><b>Need a hand?</b><p>Keep your project on track, one step at a time.</p></div><button class="profile" data-action="logout"><span class="avatar profile-avatar">${esc(initials(currentUser!.name))}</span><span class="profile-copy"><b>${esc(currentUser!.name)}</b><small>${esc(currentUser!.role)} · ${esc(currentUser!.id)}</small></span><span class="logout-mark">↗</span></button></div></aside><main class="main-area"><header class="topbar"><div class="breadcrumbs"><span>Workspace</span><b>/</b><strong>${pageTitles[page]}</strong></div><div class="topbar-right"><span class="today-label">${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><span class="header-avatar">${esc(initials(currentUser!.name))}</span></div></header><div class="content">${content}<footer>Made for curious minds <span>✳</span><small>Campus Projects · ${new Date().getFullYear()}</small></footer></div></main></div>`;
}

function coordinatorOverview() {
  const students = data.users.filter(u => u.role === 'student').length;
  const guides = data.users.filter(u => u.role === 'guide').length;
  const assigned = data.teams.reduce((n, t) => n + t.members.length, 0);
  return `${pageIntro('A clear view of every project.', 'Here’s what’s happening across your project studio today.', 'teams', 'Form teams')}<div class="metric-grid">${metric('Enrolled students', students, `${assigned} assigned to a team`, 'blue', '♧')}${metric('Faculty guides', guides, 'Ready to mentor', 'violet', '♙')}${metric('Project teams', data.teams.length, 'Across all domains', 'amber', '◈')}${metric('Needs review', data.submissions.filter(s => s.status === 'Submitted').length, 'Student submissions', 'green', '▤')}</div><div class="section-grid"><section class="panel"><div class="panel-heading"><div><h2>Project activity</h2><p>Latest submissions from your student teams</p></div><button class="text-link" data-page="reviews">View reports <span>→</span></button></div>${table(['PROJECT / TEAM', 'SUBMITTED BY', 'DATE', 'STATUS'], data.submissions.slice(-5).reverse().map(s => rowCells([`<b>${esc(s.title)}</b><small class="cell-sub">${teamName(s.teamId)}</small>`, esc(byId(s.studentId)?.name ?? s.studentId), esc(s.date), badge(s.status, s.status === 'Reviewed' ? 'green' : 'amber')])).join(''), 'No project activity yet')}</section><section class="panel quick-panel"><div class="panel-heading"><div><h2>Quick actions</h2><p>Keep things moving</p></div></div><div class="quick-list"><button data-page="students"><span class="quick-icon blue">♧</span><span><b>Add a student</b><small>Enroll a project member</small></span><i>→</i></button><button data-page="guides"><span class="quick-icon violet">♙</span><span><b>Register a guide</b><small>Bring a mentor onboard</small></span><i>→</i></button><button data-page="teams"><span class="quick-icon amber">◈</span><span><b>Organize teams</b><small>Match students and guides</small></span><i>→</i></button></div></section></div><section class="welcome-strip"><span>✳</span><div><b>Small steps add up to great projects.</b><p>Use the workspace to connect students with mentors and keep progress visible.</p></div><button class="text-link" data-page="teams">Explore teams →</button></section>`;
}
function coordinatorStudents() {
  const rows = data.users.filter(u => u.role === 'student').map(u => { const t = data.teams.find(team => team.members.includes(u.id)); return rowCells([personCell(u), esc(u.email), badge(u.domain ?? 'Unassigned', 'blue'), t ? `<b>${esc(t.id)}</b>` : badge('Unassigned'), `<button class="icon-button" title="Remove student" data-remove="${esc(u.id)}">···</button>`]); }).join('');
  return `${pageIntro('Students', 'Manage enrollment and keep project interests up to date.', 'students', '＋ Add student')}<div class="metric-grid compact">${metric('Enrolled', data.users.filter(u => u.role === 'student').length, 'Students in the workspace', 'blue', '♧')}${metric('Assigned', data.teams.reduce((n,t)=>n+t.members.length,0), 'Working in a team', 'green', '◈')}${metric('Unassigned', data.users.filter(u=>u.role==='student'&&!data.teams.some(t=>t.members.includes(u.id))).length, 'Ready for team matching', 'amber', '○')}</div>${formCard('Add a student', 'Add a student to the project workspace.', `${field('Campus ID','id','text','e.g. STU009')}${field('Full name','name','text','Student name')}${field('Email address','email','email','student@northstar.edu')}${selectField('Project interest','domain',domains)}${field('Temporary password','password','password','Set a starter password')}`, 'add-student', 'Add student')}<section class="panel"><div class="panel-heading"><div><h2>Student directory</h2><p>${data.users.filter(u=>u.role==='student').length} students enrolled</p></div><input class="search" data-search="students" placeholder="⌕  Find a student" /></div>${table(['STUDENT','EMAIL','INTEREST','TEAM',''], rows, 'No students enrolled')}</section>`;
}
function coordinatorGuides() {
  const guides = data.users.filter(u=>u.role==='guide');
  const rows = guides.map(u => { const teams = data.teams.filter(t=>t.guideId===u.id); return rowCells([personCell(u),esc(u.email),badge(u.domain??'General','violet'),String(teams.length),String(teams.reduce((n,t)=>n+t.members.length,0))]); }).join('');
  return `${pageIntro('Project guides', 'Connect each team with a faculty mentor in their field.', 'guides', '＋ Register guide')}<div class="metric-grid compact">${metric('Active guides',guides.length,'Faculty in your workspace','violet','♙')}${metric('Teams mentored',data.teams.length,'Across all project areas','blue','◈')}${metric('Domains',new Set(guides.map(g=>g.domain)).size,'Areas of expertise','amber','✳')}</div>${formCard('Register a guide','Add a faculty member and their area of expertise.',`${field('Campus ID','id','text','e.g. GUIDE003')}${field('Full name','name','text','Faculty name')}${field('Email address','email','email','guide@northstar.edu')}${selectField('Area of expertise','domain',domains)}${field('Temporary password','password','password','Set a starter password')}`,'add-guide','Register guide')}<section class="panel"><div class="panel-heading"><div><h2>Faculty directory</h2><p>Guide capacity and team assignments</p></div></div>${table(['FACULTY GUIDE','EMAIL','EXPERTISE','TEAMS','STUDENTS'],rows,'No guides registered')}</section>`;
}
function teamsPage() {
  const guideOptions = data.users.filter(u=>u.role==='guide');
  const available = data.users.filter(u=>u.role==='student'&&!data.teams.some(t=>t.members.includes(u.id)));
  const cards = data.teams.map(t=>`<article class="team-card"><div class="team-card-top"><span class="team-symbol">◈</span>${badge(t.domain,'blue')}</div><h3>${esc(t.id)}</h3><p>${esc(t.domain)} project team</p><div class="team-members">${t.members.map(id=>{const u=byId(id); return u?`<span title="${esc(u.name)}" class="avatar">${esc(initials(u.name))}</span>`:''}).join('')}<small>${t.members.length} members</small></div><div class="team-guide"><span class="avatar tiny">${esc(initials(byId(t.guideId)?.name??'?'))}</span><span><small>Faculty guide</small><b>${esc(byId(t.guideId)?.name??t.guideId)}</b></span></div></article>`).join('');
  return `${pageIntro('Project teams','Build balanced teams and see every student’s mentor at a glance.',undefined)}<section class="panel team-builder"><div class="builder-icon">◈</div><div class="builder-copy"><h2>Match students into teams</h2><p>Group students by their project interests and assign a faculty guide.</p><small>${available.length} students available · teams of up to 4</small></div>${guideOptions.length?`<button class="button primary" data-action="form-teams">Form teams <span>✳</span></button>`:`<button class="button primary" data-page="guides">Add a guide first <span>→</span></button>`}</section><div class="subheading"><div><h2>Your teams</h2><p>${data.teams.length} project teams formed</p></div></div>${cards?`<div class="team-grid">${cards}</div>`:empty('No teams formed yet','Form teams to match students by area of interest and assign a guide.')}`;
}

function reviewsPage() {
  const rows = data.submissions.slice().reverse().map(s=>rowCells([`<b>${esc(s.title)}</b><small class="cell-sub">${esc(s.kind)} · ${esc(s.teamId)}</small>`,personCell(byId(s.studentId)??{id:s.studentId,name:s.studentId,email:'',role:'student'}),esc(s.date),badge(s.status,s.status==='Reviewed'?'green':'amber'),s.status==='Submitted'?`<button class="button small" data-review="${esc(s.id)}">Mark reviewed</button>`:badge('Done','green')])).join('');
  const reports = data.submissions.filter(s=>s.kind==='Weekly report');
  return `${pageIntro('Reviews & reports','Follow student progress and keep useful feedback close at hand.')}<div class="metric-grid compact">${metric('Awaiting review',data.submissions.filter(s=>s.status==='Submitted').length,'Submissions to look at','amber','◷')}${metric('Weekly reports',reports.length,'Team progress updates','blue','▤')}${metric('Diary entries',data.diaries.length,'Student reflections','violet','✎')}</div><section class="panel"><div class="panel-heading"><div><h2>All submissions</h2><p>Project work submitted by students</p></div></div>${table(['SUBMISSION','STUDENT','DATE','STATUS','ACTION'],rows,'No submissions yet')}</section><section class="panel"><div class="panel-heading"><div><h2>Recent project diary</h2><p>Latest notes from students</p></div></div>${table(['ENTRY','STUDENT','DATE','NOTES'],data.diaries.slice().reverse().slice(0,6).map(d=>rowCells([`<b>${esc(d.title)}</b>`,esc(byId(d.studentId)?.name??d.studentId),esc(d.date),esc(d.entry)] )).join(''),'No diary entries yet')}</section>`;
}
function attendancePage() {
  const students = data.users.filter(u=>u.role==='student');
  const rows = students.map(u=>{const records=data.attendance.filter(a=>a.studentId===u.id); const present=records.filter(a=>a.status==='Present').length; const pct=records.length?Math.round(present/records.length*100):0; const team=data.teams.find(t=>t.members.includes(u.id)); return rowCells([personCell(u),esc(team?.id??'—'),esc(byId(team?.guideId??'')?.name??'—'),records.length?`${pct}%`:badge('No records'),`${present} / ${records.length}`]);}).join('');
  return `${pageIntro('Attendance','A shared view of attendance across every project team.')}<div class="metric-grid compact">${metric('Students tracked',students.length,'In the project workspace','blue','♧')}${metric('Sessions logged',data.attendance.length,'Attendance records','violet','✓')}${metric('Average present',`${students.length?Math.round(students.reduce((n,u)=>{const r=data.attendance.filter(a=>a.studentId===u.id); return n+(r.length?r.filter(a=>a.status==='Present').length/r.length:0)},0)/students.length*100):0}%`,'Across enrolled students','green','◉')}</div><section class="panel"><div class="panel-heading"><div><h2>Student attendance</h2><p>Attendance marked by faculty guides</p></div></div>${table(['STUDENT','TEAM','FACULTY GUIDE','ATTENDANCE','SESSIONS PRESENT'],rows,'No students to track')}</section>`;
}
function guideOverview() {
  const teams=data.teams.filter(t=>t.guideId===currentUser!.id); const members=teams.flatMap(t=>t.members);
  const work=data.submissions.filter(s=>teams.some(t=>t.id===s.teamId)); const pending=work.filter(s=>s.status==='Submitted').length;
  return `${pageIntro(`Welcome, ${esc(currentUser!.name.split(' ')[1]??currentUser!.name)}.`, 'Your mentoring work, team progress, and next steps in one place.', 'my-teams', 'View my teams')}<div class="metric-grid">${metric('Your teams',teams.length,'Project teams assigned','violet','◈')}${metric('Students',members.length,'Students you mentor','blue','♧')}${metric('To review',pending,'Submissions need a look','amber','◷')}${metric('Feedback given',data.remarks.filter(r=>r.guideId===currentUser!.id).length,'Notes shared with teams','green','✦')}</div><div class="section-grid"><section class="panel"><div class="panel-heading"><div><h2>Waiting for your review</h2><p>Recent work from your teams</p></div><button class="text-link" data-page="work">Open reviews →</button></div>${table(['SUBMISSION','PROJECT TEAM','DATE','STATUS'],work.slice().reverse().slice(0,5).map(s=>rowCells([`<b>${esc(s.title)}</b><small class="cell-sub">${esc(s.kind)}</small>`,esc(s.teamId),esc(s.date),badge(s.status,s.status==='Reviewed'?'green':'amber')])).join(''),'Your teams have no submissions yet')}</section><section class="panel quick-panel"><div class="panel-heading"><div><h2>Mentor shortcuts</h2><p>Support your teams</p></div></div><div class="quick-list"><button data-page="work"><span class="quick-icon amber">◷</span><span><b>Review submissions</b><small>${pending} waiting for your feedback</small></span><i>→</i></button><button data-page="feedback"><span class="quick-icon violet">✦</span><span><b>Share feedback</b><small>Give your team a helpful nudge</small></span><i>→</i></button><button data-page="attendance"><span class="quick-icon green">✓</span><span><b>Mark attendance</b><small>Log your latest session</small></span><i>→</i></button></div></section></div>`;
}
function guideTeamsPage() {
  const teams=data.teams.filter(t=>t.guideId===currentUser!.id);
  const cards=teams.map(t=>`<article class="team-card"><div class="team-card-top"><span class="team-symbol">◈</span>${badge(t.domain,'blue')}</div><h3>${esc(t.id)}</h3><p>Formed ${esc(t.created)}</p><div class="team-roster">${t.members.map(id=>{const u=byId(id); return u?`<div class="roster-person">${personCell(u)}<span class="roster-email">${esc(u.email)}</span></div>`:''}).join('')}</div><button class="text-link" data-page="work">View submitted work →</button></article>`).join('');
  return `${pageIntro('My teams','Get to know the students and projects you’re mentoring.')}<div class="metric-grid compact">${metric('Project teams',teams.length,'Assigned to you','violet','◈')}${metric('Students',teams.reduce((n,t)=>n+t.members.length,0),'Across your teams','blue','♧')}${metric('Submissions',data.submissions.filter(s=>teams.some(t=>t.id===s.teamId)).length,'Student project updates','amber','▤')}</div>${cards?`<div class="team-grid">${cards}</div>`:empty('No teams assigned yet','Your coordinator will assign project teams here.')}`;
}
function guideWorkPage() {
  const teams=data.teams.filter(t=>t.guideId===currentUser!.id); const subs=data.submissions.filter(s=>teams.some(t=>t.id===s.teamId));
  const rows=subs.slice().reverse().map(s=>rowCells([`<b>${esc(s.title)}</b><small class="cell-sub">${esc(s.kind)} · ${esc(s.description||'No description')}</small>`,esc(s.teamId),esc(byId(s.studentId)?.name??s.studentId),esc(s.date),badge(s.status,s.status==='Reviewed'?'green':'amber'),s.status==='Submitted'?`<button class="button small" data-review="${esc(s.id)}">Mark reviewed</button>`:badge('Done','green')])).join('');
  return `${pageIntro('Review team work','Read new submissions and keep project momentum visible.')}<div class="metric-grid compact">${metric('To review',subs.filter(s=>s.status==='Submitted').length,'Waiting for your feedback','amber','◷')}${metric('Reviewed',subs.filter(s=>s.status==='Reviewed').length,'Completed reviews','green','✓')}${metric('All submissions',subs.length,'From your teams','blue','▤')}</div><section class="panel"><div class="panel-heading"><div><h2>Team submissions</h2><p>Click “Mark reviewed” when you’ve reviewed a submission.</p></div></div>${table(['PROJECT WORK','TEAM','SUBMITTED BY','DATE','STATUS','ACTION'],rows,'No submissions from your teams yet')}</section>`;
}
function guideFeedbackPage() {
  const teams=data.teams.filter(t=>t.guideId===currentUser!.id);
  const rows=data.remarks.filter(r=>r.guideId===currentUser!.id).slice().reverse().map(r=>rowCells([esc(r.teamId),badge(r.kind,'violet'),esc(r.text),`${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}`,esc(r.date)])).join('');
  return `${pageIntro('Share thoughtful feedback','A short note can help a project team find its next step.')}<div class="section-grid"><div>${teams.length?formCard('Write a team note','Choose a team and leave clear, constructive feedback.',`${selectField('Project team','team',teams.map(t=>t.id))}${selectField('Feedback type','kind',['Feedback','Suggestion','Appreciation','Improvement needed'])}<label class="field full"><span>Your note<em>*</em></span><textarea name="text" required placeholder="What is going well? What could the team try next?"></textarea></label>${selectField('Progress rating','rating',['5','4','3','2','1'])}`,'remark','Send feedback'):empty('No teams to give feedback to','When you’re assigned a team, you can share notes here.')}</div><section class="panel"><div class="panel-heading"><div><h2>Your recent feedback</h2><p>Notes you’ve shared with teams</p></div></div>${table(['TEAM','TYPE','NOTE','RATING','DATE'],rows,'No feedback shared yet')}</section></div>`;
}
function guideAttendancePage() {
  const teams=data.teams.filter(t=>t.guideId===currentUser!.id); const students=teams.flatMap(t=>t.members.map(id=>byId(id)).filter((u):u is User=>!!u));
  const rows=students.map(u=>{const records=data.attendance.filter(a=>a.studentId===u.id);const present=records.filter(a=>a.status==='Present').length;return rowCells([personCell(u),esc(data.teams.find(t=>t.members.includes(u.id))?.id??'—'),String(records.length),`${present} present`,records.length?`${Math.round(present/records.length*100)}%`:badge('No records')]);}).join('');
  return `${pageIntro('Attendance','Take attendance for your project sessions.')}<div class="section-grid">${students.length?formCard('Log attendance','Choose a student and record today’s attendance.',`${selectField('Student','studentId',students.map(s=>`${s.id} · ${s.name}`))}${field('Session date','date','date')}${selectField('Attendance status','status',['Present','Absent','Leave'])}`,'attendance','Save attendance'):empty('No students assigned','Once a team is assigned, you can log attendance here.')}<section class="panel"><div class="panel-heading"><div><h2>Attendance overview</h2><p>For students across your teams</p></div></div>${table(['STUDENT','TEAM','SESSIONS','PRESENT','ATTENDANCE'],rows,'No attendance records yet')}</section></div>`;
}
function studentOverview() {
  const team=data.teams.find(t=>t.members.includes(currentUser!.id)); const subs=data.submissions.filter(s=>s.studentId===currentUser!.id); const diary=data.diaries.filter(d=>d.studentId===currentUser!.id);
  const guide=team?byId(team.guideId):undefined; const completed=Math.min(100,subs.length*18+diary.length*8);
  return `${pageIntro(`Good to see you, ${esc(currentUser!.name.split(' ')[0])}.`,'A little progress today goes a long way. Here’s your project at a glance.','contribute','Add project work')}<div class="student-hero"><div class="hero-copy"><span class="hero-kicker">YOUR PROJECT SPACE</span><h2>${team?`You’re building something<br><em>great together.</em>`:'Your next big idea starts here.'}</h2><p>${team?`${esc(team.id)} · ${esc(team.domain)}${guide?` · Guided by ${esc(guide.name)}`:''}`:'Your coordinator will assign you to a project team soon.'}</p><button class="button hero-button" data-page="${team?'my-feedback':'diary'}">${team?'See team updates':'Start a project diary'} <span>→</span></button></div><div class="hero-art"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="orbit-core">✳</div><span class="orbit-dot dot-one">✦</span><span class="orbit-dot dot-two">◈</span><span class="orbit-dot dot-three">○</span></div><div class="hero-foot"><span>✳</span>Every milestone starts with a first step.</div></div><div class="metric-grid student-metrics">${metric('Team',team?team.id:'Not assigned',team?`${team.members.length} team members`:'Your coordinator is getting things ready','violet','◈')}${metric('Project updates',subs.length,'Items you’ve shared','blue','↑')}${metric('Diary entries',diary.length,'Notes about your progress','amber','✎')}${metric('Your activity',`${completed}%`,'Based on project updates','green','◉')}</div><div class="section-grid"><section class="panel"><div class="panel-heading"><div><h2>Recent project updates</h2><p>Your latest submissions and reports</p></div><button class="text-link" data-page="contribute">Add an update →</button></div>${table(['PROJECT WORK','DATE','STATUS'],subs.slice().reverse().slice(0,4).map(s=>rowCells([`<b>${esc(s.title)}</b><small class="cell-sub">${esc(s.kind)}</small>`,esc(s.date),badge(s.status,s.status==='Reviewed'?'green':'amber')])).join(''),'Nothing shared yet')}</section><section class="panel quick-panel"><div class="panel-heading"><div><h2>Make progress</h2><p>Pick up where you left off</p></div></div><div class="quick-list"><button data-page="contribute"><span class="quick-icon blue">↑</span><span><b>Share project work</b><small>Upload an update or weekly report</small></span><i>→</i></button><button data-page="diary"><span class="quick-icon amber">✎</span><span><b>Write in your diary</b><small>Capture today’s progress</small></span><i>→</i></button><button data-page="my-feedback"><span class="quick-icon violet">✦</span><span><b>Check your feedback</b><small>See guide notes and attendance</small></span><i>→</i></button></div></section></div>`;
}
function studentContribute() {
  const team=data.teams.find(t=>t.members.includes(currentUser!.id));
  const guard=team?'':empty('Team assignment needed','Ask your coordinator when your project team will be available.');
  return `${pageIntro('Share what you’ve been working on','Keep your team and guide in the loop as your project takes shape.')}<div class="section-grid two-forms">${team?formCard('Project update','Share a file, design, or other project milestone.',`${selectField('Work type','kind',['Code files','Documentation','Design files','Research paper','Presentation','Other'])}${field('Update title','title','text','e.g. API documentation')}${field('Description','description','text','What does this update include?',false)}`,'submission','Submit project update'):guard}${team?formCard('Weekly progress report','Summarize your team’s progress this week.',`${field('Week number','week','number','e.g. 4')}${field('Work completed','work','text','What did your team accomplish?')}${field('Challenges','challenges','text','What slowed you down?',false)}${field('Next steps','plans','text','What’s the team planning next?',false)}`,'weekly-report','Send weekly report'):''}</div>`;
}
function studentDiaryPage() {
  const entries=data.diaries.filter(d=>d.studentId===currentUser!.id).slice().reverse();
  const cards=entries.map(d=>`<article class="diary-card"><div class="diary-date"><b>${new Intl.DateTimeFormat('en',{day:'2-digit'}).format(new Date(`${d.date}T00:00:00`))}</b><small>${new Intl.DateTimeFormat('en',{month:'short'}).format(new Date(`${d.date}T00:00:00`))}</small></div><div class="diary-copy"><h3>${esc(d.title)}</h3><small>${esc(d.date)}</small><p>${esc(d.entry)}</p></div></article>`).join('');
  return `${pageIntro('Project diary','Capture the little wins, lessons, and ideas that move your project forward.')}<div class="section-grid"><div>${formCard('Add a diary entry','A few lines is all it takes to track your progress.',`${field('Date','date','date')}${field('Entry title','title','text','e.g. First prototype is working')}${textareaField('What did you work on?','entry','Write a note about today’s progress.')}`,'diary','Save diary entry')}</div><section class="panel"><div class="panel-heading"><div><h2>Your project journal</h2><p>${entries.length} entries so far</p></div></div>${cards?`<div class="diary-list">${cards}</div>`:empty('Your journal is ready','Add a diary entry to remember what you’ve learned along the way.')}</section></div>`;
}
function studentFeedbackPage() {
  const team=data.teams.find(t=>t.members.includes(currentUser!.id)); const remarks=team?data.remarks.filter(r=>r.teamId===team.id).slice().reverse():[];
  const comments=remarks.map(r=>`<article class="feedback-card"><div class="feedback-top"><span class="avatar">${esc(initials(byId(r.guideId)?.name??'?'))}</span><div><b>${esc(byId(r.guideId)?.name??'Faculty guide')}</b><small>${esc(r.date)} · ${badge(r.kind,'violet')}</small></div><span class="rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></div><p>${esc(r.text)}</p></article>`).join('');
  const attendance=data.attendance.filter(a=>a.studentId===currentUser!.id).slice().reverse();
  return `${pageIntro('Feedback & attendance','Helpful notes and session records from your faculty guide.')}<div class="section-grid"><section class="panel"><div class="panel-heading"><div><h2>Notes from your guide</h2><p>${team?`For ${esc(team.id)}`:'Waiting for a team assignment'}</p></div></div>${comments?`<div class="feedback-list">${comments}</div>`:empty(team?'No notes yet':'Your team is being arranged',team?'Your guide’s feedback will appear here.':'Your project feedback will show here once you’re assigned.')}</section><section class="panel"><div class="panel-heading"><div><h2>Attendance record</h2><p>Sessions logged by your guide</p></div></div>${table(['DATE','SESSION STATUS'],attendance.map(a=>rowCells([esc(a.date),badge(a.status,a.status==='Present'?'green':a.status==='Absent'?'red':'amber')])).join(''),'No attendance logged yet')}</section></div>`;
}

function render() {
  if (!currentUser) { root.innerHTML=loginView(); return; }
  const views: Record<Page, () => string> = {
    overview: currentUser.role==='coordinator'?coordinatorOverview:currentUser.role==='guide'?guideOverview:studentOverview,
    students: coordinatorStudents, guides: coordinatorGuides, teams: teamsPage, reviews: reviewsPage, attendance: currentUser.role==='guide'?guideAttendancePage:attendancePage,
    'my-teams': guideTeamsPage, work: guideWorkPage, feedback: guideFeedbackPage, contribute: studentContribute, diary: studentDiaryPage, 'my-feedback': studentFeedbackPage,
  };
  root.innerHTML=shell(views[page]());
}

async function handleSubmit(form: HTMLFormElement) {
  const values=Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
  const type=form.dataset.form;
  try {
    if(type==='login') {
      const result=await api<{token:string;user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify(values)});
      authToken=result.token;sessionStorage.setItem('campus-projects-token',authToken);currentUser=result.user;
      await syncData();page='overview';render();return;
    }
    if(type==='add-student'||type==='add-guide') {
      const role:Role=type==='add-student'?'student':'guide';
      await api('/api/users',{method:'POST',body:JSON.stringify({...values,role})});
      await syncData();notify(type==='add-student'?'Student added to the workspace.':'Guide registered successfully.');render();return;
    }
    if(type==='submission'||type==='weekly-report') {
      const weekly=type==='weekly-report';
      const title=weekly?`Week ${values.week} progress report`:values.title.trim();
      const description=weekly?`Completed: ${values.work}. Challenges: ${values.challenges||'None noted'}. Next: ${values.plans||'Not specified'}.`:values.description;
      await api('/api/submissions',{method:'POST',body:JSON.stringify({kind:weekly?'Weekly report':values.kind,title,description})});
      await syncData();notify(weekly?'Weekly report sent to your guide.':'Project update shared with your team.');render();return;
    }
    if(type==='diary') {
      await api('/api/diaries',{method:'POST',body:JSON.stringify(values)});await syncData();notify('Diary entry saved.');render();return;
    }
    if(type==='remark') {
      await api('/api/remarks',{method:'POST',body:JSON.stringify({teamId:values.team,kind:values.kind,text:values.text,rating:Number(values.rating)})});
      await syncData();notify('Feedback shared with your team.');render();return;
    }
    if(type==='attendance') {
      await api('/api/attendance',{method:'POST',body:JSON.stringify({studentId:values.studentId.split(' · ')[0],date:values.date,status:values.status})});
      await syncData();notify('Attendance saved.');render();
    }
  } catch(error) { notify(errorMessage(error),'error'); }
}
async function handleClick(target: HTMLElement) {
  const nav=target.closest<HTMLElement>('[data-page]');
  if(nav){const next=nav.dataset.page as Page;if(next===page&&(next==='students'||next==='guides')){const form=document.querySelector<HTMLFormElement>(`[data-form="add-${next==='students'?'student':'guide'}"]`);form?.scrollIntoView({behavior:'smooth',block:'center'});form?.querySelector('input')?.focus({preventScroll:true});}else if(next in pageTitles){page=next;render();window.scrollTo(0,0);}return;}
  const action=target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if(action==='logout'){
    try { await api('/api/auth/logout',{method:'POST'}); } catch { /* clear the local session even if the API is unavailable */ }
    authToken=null;sessionStorage.removeItem('campus-projects-token');currentUser=null;render();return;
  }
  if(action==='form-teams'){
    try { const result=await api<{count:number}>('/api/teams/form',{method:'POST'});await syncData();notify(`${result.count} project team${result.count===1?'':'s'} formed successfully.`);render(); }
    catch(error) { notify(errorMessage(error),'error'); }
    return;
  }
  const review=target.closest<HTMLElement>('[data-review]')?.dataset.review;
  if(review){
    try { await api(`/api/submissions/${encodeURIComponent(review)}/review`,{method:'PATCH'});await syncData();notify('Submission marked as reviewed.');render(); }
    catch(error) { notify(errorMessage(error),'error'); }
    return;
  }
  const remove=target.closest<HTMLElement>('[data-remove]')?.dataset.remove;
  if(remove){const user=byId(remove);if(user&&window.confirm(`Remove ${user.name} from the workspace?`)){
    try { await api(`/api/users/${encodeURIComponent(remove)}`,{method:'DELETE'});await syncData();notify('Student removed.');render(); }
    catch(error) { notify(errorMessage(error),'error'); }
  }}
}
async function bootstrap() {
  if(!authToken){render();return;}
  try {
    const result=await api<{user:User}>('/api/auth/me');currentUser=result.user;await syncData();
  } catch { authToken=null;sessionStorage.removeItem('campus-projects-token');currentUser=null; }
  render();
}
root.addEventListener('click',e=>{void handleClick(e.target as HTMLElement);});
root.addEventListener('submit',e=>{e.preventDefault();void handleSubmit(e.target as HTMLFormElement);});
root.addEventListener('input',e=>{const el=e.target as HTMLInputElement;if(el.dataset.search==='students'){document.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach(row=>row.hidden=!row.innerText.toLowerCase().includes(el.value.toLowerCase()));}});
void bootstrap();
