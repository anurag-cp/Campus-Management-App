import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Attendance, Database, Diary, PublicDatabase, PublicUser, Remark, Submission, Team, User } from './types.js';

const scrypt = promisify(scryptCb);
const dataPath = resolve(process.env.DB_FILE ?? 'backend/data/projects.sqlite');
mkdirSync(dirname(dataPath), { recursive: true });
const sqlite = new DatabaseSync(dataPath);
sqlite.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('coordinator', 'guide', 'student')),
    password_hash TEXT NOT NULL,
    domain TEXT
  );
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    guide_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS team_members (
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    PRIMARY KEY (team_id, student_id),
    UNIQUE (student_id)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('Submitted', 'Reviewed'))
  );
  CREATE TABLE IF NOT EXISTS diaries (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    title TEXT NOT NULL,
    entry TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS remarks (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    guide_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    date TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Leave')),
    UNIQUE (student_id, date)
  );
  CREATE INDEX IF NOT EXISTS idx_teams_guide ON teams(guide_id);
  CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_id);
  CREATE INDEX IF NOT EXISTS idx_diaries_student ON diaries(student_id);
  CREATE INDEX IF NOT EXISTS idx_remarks_team ON remarks(team_id);
`);

const blank: Database = { users: [], teams: [], submissions: [], diaries: [], remarks: [], attendance: [] };
const demoUsers: Array<Omit<User, 'passwordHash'>> = [
  { id: 'COORD001', name: 'Avery Morgan', email: 'avery.morgan@northstar.edu', role: 'coordinator' },
  { id: 'GUIDE001', name: 'Dr. Maya Chen', email: 'maya.chen@northstar.edu', role: 'guide', domain: 'Artificial Intelligence' },
  { id: 'GUIDE002', name: 'Prof. Leo Martin', email: 'leo.martin@northstar.edu', role: 'guide', domain: 'Cloud Computing' },
  { id: 'STU001', name: 'Rahul Kumar', email: 'rahul.kumar@northstar.edu', role: 'student', domain: 'Artificial Intelligence' },
  { id: 'STU002', name: 'Priya Singh', email: 'priya.singh@northstar.edu', role: 'student', domain: 'Artificial Intelligence' },
  { id: 'STU003', name: 'Arjun Patel', email: 'arjun.patel@northstar.edu', role: 'student', domain: 'Cloud Computing' },
  { id: 'STU004', name: 'Anjali Sharma', email: 'anjali.sharma@northstar.edu', role: 'student', domain: 'Cloud Computing' },
  { id: 'STU005', name: 'Vikram Desai', email: 'vikram.desai@northstar.edu', role: 'student', domain: 'IoT' },
  { id: 'STU006', name: 'Neha Gupta', email: 'neha.gupta@northstar.edu', role: 'student', domain: 'Web Development' },
  { id: 'STU007', name: 'Sameer Khan', email: 'sameer.khan@northstar.edu', role: 'student', domain: 'Artificial Intelligence' },
  { id: 'STU008', name: 'Divya Menon', email: 'divya.menon@northstar.edu', role: 'student', domain: 'Cloud Computing' },
];

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function publicUser(user: User): PublicUser {
  const safe = { ...user } as Partial<User>;
  delete safe.passwordHash;
  return safe as PublicUser;
}

let db: Database = structuredClone(blank);

function readDatabase(): Database {
  const users = sqlite.prepare('SELECT id, name, email, role, password_hash AS passwordHash, domain FROM users').all() as unknown as User[];
  const teams = sqlite.prepare('SELECT id, domain, guide_id AS guideId, created FROM teams').all() as unknown as Team[];
  const members = sqlite.prepare('SELECT team_id AS teamId, student_id AS studentId FROM team_members').all() as unknown as Array<{ teamId: string; studentId: string }>;
  const membersByTeam = new Map<string, string[]>();
  for (const member of members) membersByTeam.set(member.teamId, [...(membersByTeam.get(member.teamId) ?? []), member.studentId]);
  for (const team of teams) team.members = membersByTeam.get(team.id) ?? [];
  const submissions = sqlite.prepare('SELECT id, team_id AS teamId, student_id AS studentId, kind, title, date, description, status FROM submissions').all() as unknown as Submission[];
  const diaries = sqlite.prepare('SELECT id, student_id AS studentId, date, title, entry FROM diaries').all() as unknown as Diary[];
  const remarks = sqlite.prepare('SELECT id, team_id AS teamId, guide_id AS guideId, kind, text, rating, date FROM remarks').all() as unknown as Remark[];
  const attendance = sqlite.prepare('SELECT id, student_id AS studentId, date, status FROM attendance').all() as unknown as Attendance[];
  return { users, teams, submissions, diaries, remarks, attendance };
}

export function publicDatabase(): PublicDatabase {
  return { ...db, users: db.users.map(publicUser) };
}

export async function initializeStore(): Promise<void> {
  db = readDatabase();
  if (db.users.length) return;
  db.users = await Promise.all(demoUsers.map(async user => ({
    ...user,
    passwordHash: await hashPassword(user.role === 'coordinator' ? 'admin123' : user.role === 'guide' ? 'guide123' : 'student123'),
  })));
  await saveDatabase();
}

export function getDatabase(): Database { return db; }

export async function saveDatabase(): Promise<void> {
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    sqlite.exec('DELETE FROM attendance; DELETE FROM remarks; DELETE FROM diaries; DELETE FROM submissions; DELETE FROM team_members; DELETE FROM teams; DELETE FROM users;');
    const addUser = sqlite.prepare('INSERT INTO users (id, name, email, role, password_hash, domain) VALUES (?, ?, ?, ?, ?, ?)');
    const addTeam = sqlite.prepare('INSERT INTO teams (id, domain, guide_id, created) VALUES (?, ?, ?, ?)');
    const addMember = sqlite.prepare('INSERT INTO team_members (team_id, student_id) VALUES (?, ?)');
    const addSubmission = sqlite.prepare('INSERT INTO submissions (id, team_id, student_id, kind, title, date, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const addDiary = sqlite.prepare('INSERT INTO diaries (id, student_id, date, title, entry) VALUES (?, ?, ?, ?, ?)');
    const addRemark = sqlite.prepare('INSERT INTO remarks (id, team_id, guide_id, kind, text, rating, date) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const addAttendance = sqlite.prepare('INSERT INTO attendance (id, student_id, date, status) VALUES (?, ?, ?, ?)');
    for (const user of db.users) addUser.run(user.id, user.name, user.email, user.role, user.passwordHash, user.domain ?? null);
    for (const team of db.teams) {
      addTeam.run(team.id, team.domain, team.guideId, team.created);
      for (const studentId of team.members) addMember.run(team.id, studentId);
    }
    for (const item of db.submissions) addSubmission.run(item.id, item.teamId, item.studentId, item.kind, item.title, item.date, item.description, item.status);
    for (const item of db.diaries) addDiary.run(item.id, item.studentId, item.date, item.title, item.entry);
    for (const item of db.remarks) addRemark.run(item.id, item.teamId, item.guideId, item.kind, item.text, item.rating, item.date);
    for (const item of db.attendance) addAttendance.run(item.id, item.studentId, item.date, item.status);
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    throw error;
  }
}
