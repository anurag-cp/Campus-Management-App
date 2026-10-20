import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, hashPassword, initializeStore, publicUser, saveDatabase, verifyPassword } from './store.js';
import type { Role, SessionUser } from './types.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const sessions = new Map<string, SessionUser>();
const attempts = new Map<string, { count: number; until: number }>();
const allowedDomains = new Set(['Artificial Intelligence', 'Cloud Computing', 'IoT', 'Web Development', 'Blockchain', 'Mobile Development', 'Cybersecurity', 'Data Science']);
const allowedRemarkTypes = new Set(['Feedback', 'Suggestion', 'Appreciation', 'Improvement needed']);
const authPrefix = 'Bearer ';

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

function fail(res: Response, status: number, message: string) { return res.status(status).json({ error: message }); }
function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const session = header.startsWith(authPrefix) ? sessions.get(header.slice(authPrefix.length)) : undefined;
  if (!session) return fail(res, 401, 'Please sign in again.');
  res.locals.user = session;
  next();
}
function allow(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user) return fail(res, 401, 'Please sign in again.');
    if (!roles.includes(user.role)) return fail(res, 403, 'You do not have permission to do that.');
    next();
  };
}
function validString(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}
function myTeam(studentId: string) { return getDatabase().teams.find(team => team.members.includes(studentId)); }
function guideOwnsTeam(guideId: string, teamId: string) { return getDatabase().teams.some(team => team.id === teamId && team.guideId === guideId); }
function guideOwnsStudent(guideId: string, studentId: string) { const team = myTeam(studentId); return !!team && team.guideId === guideId; }
function visibleState(user: SessionUser) {
  const db = getDatabase();
  if (user.role === 'coordinator') return { ...db, users: db.users.map(publicUser) };
  const teams = user.role === 'guide'
    ? db.teams.filter(team => team.guideId === user.id)
    : db.teams.filter(team => team.members.includes(user.id));
  const teamIds = new Set(teams.map(team => team.id));
  const studentIds = user.role === 'guide' ? teams.flatMap(team => team.members) : [user.id];
  const visibleUserIds = new Set([user.id, ...teams.flatMap(team => team.members), ...teams.map(team => team.guideId)]);
  return {
    users: db.users.filter(candidate => visibleUserIds.has(candidate.id)).map(publicUser),
    teams,
    submissions: db.submissions.filter(item => user.role === 'guide' ? teamIds.has(item.teamId) : item.studentId === user.id),
    diaries: user.role === 'guide' ? [] : db.diaries.filter(item => item.studentId === user.id),
    remarks: db.remarks.filter(item => teamIds.has(item.teamId)),
    attendance: db.attendance.filter(item => studentIds.includes(item.studentId)),
  };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip ?? 'unknown';
  const attempt = attempts.get(ip);
  if (attempt && attempt.until > Date.now() && attempt.count >= 10) return fail(res, 429, 'Too many sign-in attempts. Try again in a few minutes.');
  const id = typeof req.body?.id === 'string' ? req.body.id.trim().toUpperCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const role = req.body?.role as Role;
  const user = getDatabase().users.find(candidate => candidate.id === id && candidate.role === role);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    const count = attempt && attempt.until > Date.now() ? attempt.count + 1 : 1;
    attempts.set(ip, { count, until: Date.now() + 15 * 60 * 1000 });
    return fail(res, 401, 'Those details didn’t match. Check your role, ID, and password.');
  }
  attempts.delete(ip);
  const token = randomUUID();
  const session: SessionUser = { id: user.id, name: user.name, role: user.role };
  sessions.set(token, session);
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', auth, (_req, res) => {
  const session = res.locals.user as SessionUser;
  const user = getDatabase().users.find(candidate => candidate.id === session.id);
  if (!user) return fail(res, 401, 'Account no longer exists.');
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  const token = (req.header('authorization') ?? '').slice(authPrefix.length);
  sessions.delete(token);
  res.status(204).end();
});

app.get('/api/state', auth, (_req, res) => res.json(visibleState(res.locals.user as SessionUser)));

app.post('/api/users', auth, allow('coordinator'), async (req, res) => {
  const { id: rawId, name, email, role, domain, password } = req.body ?? {};
  const id = typeof rawId === 'string' ? rawId.trim().toUpperCase() : '';
  if (!validString(id, 30) || !validString(name, 100) || !validString(email, 200) || !['student', 'guide'].includes(role) || !validString(password, 200)) return fail(res, 400, 'Enter a valid ID, name, email, role, and password.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Enter a valid email address.');
  if (getDatabase().users.some(user => user.id === id)) return fail(res, 409, 'That campus ID is already in use.');
  if (!allowedDomains.has(domain)) return fail(res, 400, 'Choose a valid project domain.');
  const user = { id, name: name.trim(), email: email.trim(), role: role as 'student' | 'guide', domain, passwordHash: await hashPassword(password) };
  getDatabase().users.push(user);
  await saveDatabase();
  res.status(201).json({ user: publicUser(user) });
});

app.delete('/api/users/:id', auth, allow('coordinator'), async (req, res) => {
  const db = getDatabase();
  const user = db.users.find(candidate => candidate.id === req.params.id);
  if (!user || user.role !== 'student') return fail(res, 404, 'Student not found.');
  if (db.teams.some(team => team.members.includes(user.id))) return fail(res, 409, 'Remove the student from their team before deleting this account.');
  db.users = db.users.filter(candidate => candidate.id !== user.id);
  db.diaries = db.diaries.filter(entry => entry.studentId !== user.id);
  db.submissions = db.submissions.filter(entry => entry.studentId !== user.id);
  db.attendance = db.attendance.filter(entry => entry.studentId !== user.id);
  await saveDatabase();
  res.status(204).end();
});

app.post('/api/teams/form', auth, allow('coordinator'), async (_req, res) => {
  const db = getDatabase();
  const available = db.users.filter(user => user.role === 'student' && !db.teams.some(team => team.members.includes(user.id)));
  const guides = db.users.filter(user => user.role === 'guide');
  if (!guides.length) return fail(res, 409, 'Add at least one faculty guide before forming teams.');
  if (!available.length) return fail(res, 409, 'All students are already assigned to teams.');
  const grouped = new Map<string, typeof available>();
  for (const student of available) {
    const domain = student.domain ?? 'General';
    grouped.set(domain, [...(grouped.get(domain) ?? []), student]);
  }
  let count = 0;
  for (const [domain, students] of grouped) {
    for (let i = 0; i < students.length; i += 4) {
      const guide = guides.find(candidate => candidate.domain === domain) ?? guides[count % guides.length]!;
      db.teams.push({ id: `TEAM${String(db.teams.length + 1).padStart(3, '0')}`, domain, guideId: guide.id, members: students.slice(i, i + 4).map(student => student.id), created: new Date().toISOString().slice(0, 10) });
      count++;
    }
  }
  await saveDatabase();
  res.status(201).json({ count, teams: db.teams });
});

app.post('/api/submissions', auth, allow('student'), async (req, res) => {
  const user = res.locals.user as SessionUser;
  const team = myTeam(user.id);
  const { kind, title, description = '' } = req.body ?? {};
  if (!team) return fail(res, 409, 'You need a team before submitting project work.');
  if (!validString(kind, 60) || !validString(title, 160) || (typeof description !== 'string' || description.length > 3000)) return fail(res, 400, 'Enter a valid submission type and title.');
  const submission = { id: randomUUID(), teamId: team.id, studentId: user.id, kind: kind.trim(), title: title.trim(), description: description.trim(), date: new Date().toISOString().slice(0, 10), status: 'Submitted' as const };
  getDatabase().submissions.push(submission);
  await saveDatabase();
  res.status(201).json({ submission });
});

app.patch('/api/submissions/:id/review', auth, allow('coordinator', 'guide'), async (req, res) => {
  const user = res.locals.user as SessionUser;
  const submission = getDatabase().submissions.find(item => item.id === req.params.id);
  if (!submission) return fail(res, 404, 'Submission not found.');
  if (user.role === 'guide' && !guideOwnsTeam(user.id, submission.teamId)) return fail(res, 403, 'This submission is outside your teams.');
  submission.status = 'Reviewed';
  await saveDatabase();
  res.json({ submission });
});

app.post('/api/diaries', auth, allow('student'), async (req, res) => {
  const user = res.locals.user as SessionUser;
  const { date, title, entry } = req.body ?? {};
  if (!validString(date, 10) || !validString(title, 160) || !validString(entry, 5000)) return fail(res, 400, 'Enter a date, title, and diary note.');
  const diary = { id: randomUUID(), studentId: user.id, date, title: title.trim(), entry: entry.trim() };
  getDatabase().diaries.push(diary);
  await saveDatabase();
  res.status(201).json({ diary });
});

app.post('/api/remarks', auth, allow('guide'), async (req, res) => {
  const user = res.locals.user as SessionUser;
  const { teamId, kind, text, rating } = req.body ?? {};
  if (!validString(teamId, 30) || !guideOwnsTeam(user.id, teamId)) return fail(res, 403, 'Choose one of your assigned teams.');
  if (!allowedRemarkTypes.has(kind) || !validString(text, 3000) || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, 'Enter valid feedback and a rating from 1 to 5.');
  const remark = { id: randomUUID(), teamId, guideId: user.id, kind, text: text.trim(), rating, date: new Date().toISOString().slice(0, 10) };
  getDatabase().remarks.push(remark);
  await saveDatabase();
  res.status(201).json({ remark });
});

app.post('/api/attendance', auth, allow('guide'), async (req, res) => {
  const user = res.locals.user as SessionUser;
  const { studentId, date, status } = req.body ?? {};
  if (!validString(studentId, 30) || !guideOwnsStudent(user.id, studentId)) return fail(res, 403, 'Choose a student from one of your teams.');
  if (!validString(date, 10) || !['Present', 'Absent', 'Leave'].includes(status)) return fail(res, 400, 'Enter a valid date and attendance status.');
  const records = getDatabase().attendance;
  if (records.some(record => record.studentId === studentId && record.date === date)) return fail(res, 409, 'Attendance for this student and date is already recorded.');
  const attendance = { id: randomUUID(), studentId, date, status: status as 'Present' | 'Absent' | 'Leave' };
  records.push(attendance);
  await saveDatabase();
  res.status(201).json({ attendance });
});

app.use('/api', (_req, res) => fail(res, 404, 'API route not found.'));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  if (error instanceof SyntaxError) return fail(res, 400, 'Request body must be valid JSON.');
  return fail(res, 500, 'Something went wrong. Please try again.');
});

const here = fileURLToPath(new URL('.', import.meta.url));
const productionAssets = resolve(here, '../dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(productionAssets));
  app.get(/.*/, (_req, res) => res.sendFile(resolve(productionAssets, 'index.html')));
}

await initializeStore();
app.listen(port, host, () => console.log(`Campus Projects API listening on http://${host}:${port}`));
