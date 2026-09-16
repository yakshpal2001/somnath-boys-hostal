const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'hostel.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    father_name TEXT,
    phone TEXT,
    address TEXT,
    id_proof_type TEXT,
    id_proof_number TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS stays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    room_no TEXT,
    check_in_date TEXT,
    check_out_date TEXT,
    fees_paid TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_students_name ON students(name);
  CREATE INDEX IF NOT EXISTS idx_stays_student_id ON stays(student_id);
`);

const stayColumns = db.prepare("PRAGMA table_info(stays)").all().map((c) => c.name);
if (!stayColumns.includes('fees_due_date')) {
  db.exec('ALTER TABLE stays ADD COLUMN fees_due_date TEXT');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getStaysForStudent(studentId) {
  return db.prepare(
    'SELECT * FROM stays WHERE student_id = ? ORDER BY check_in_date DESC, id DESC'
  ).all(studentId);
}

function getStudentWithStays(id) {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) return null;
  student.stays = getStaysForStudent(id);
  return student;
}

// Search / list students by name (empty query returns all, newest first)
app.get('/api/students', (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db.prepare(
      'SELECT * FROM students WHERE name LIKE ? ORDER BY name COLLATE NOCASE'
    ).all(`%${q}%`);
  } else {
    rows = db.prepare('SELECT * FROM students ORDER BY id DESC').all();
  }
  const withStays = rows.map((s) => {
    s.stays = getStaysForStudent(s.id);
    return s;
  });
  res.json(withStays);
});

app.get('/api/students/:id', (req, res) => {
  const student = getStudentWithStays(req.params.id);
  if (!student) return res.status(404).json({ error: 'Not found' });
  res.json(student);
});

// Create a new student, optionally with an initial stay
app.post('/api/students', (req, res) => {
  const { name, father_name, phone, address, id_proof_type, id_proof_number,
    room_no, check_in_date, check_out_date, fees_paid, fees_due_date, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const insertStudent = db.prepare(`
    INSERT INTO students (name, father_name, phone, address, id_proof_type, id_proof_number)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = insertStudent.run(
    name.trim(), father_name || '', phone || '', address || '',
    id_proof_type || '', id_proof_number || ''
  );
  const studentId = result.lastInsertRowid;

  if (room_no || check_in_date || check_out_date || fees_paid || fees_due_date || notes) {
    db.prepare(`
      INSERT INTO stays (student_id, room_no, check_in_date, check_out_date, fees_paid, fees_due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(studentId, room_no || '', check_in_date || '', check_out_date || '', fees_paid || '', fees_due_date || '', notes || '');
  }

  res.status(201).json(getStudentWithStays(studentId));
});

// Update student's personal details
app.put('/api/students/:id', (req, res) => {
  const { name, father_name, phone, address, id_proof_type, id_proof_number } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  const result = db.prepare(`
    UPDATE students SET name = ?, father_name = ?, phone = ?, address = ?,
      id_proof_type = ?, id_proof_number = ? WHERE id = ?
  `).run(name.trim(), father_name || '', phone || '', address || '',
    id_proof_type || '', id_proof_number || '', req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json(getStudentWithStays(req.params.id));
});

app.delete('/api/students/:id', (req, res) => {
  const result = db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Add a new stay/check-in record for an existing student
app.post('/api/students/:id/stays', (req, res) => {
  const student = db.prepare('SELECT id FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const { room_no, check_in_date, check_out_date, fees_paid, fees_due_date, notes } = req.body;
  db.prepare(`
    INSERT INTO stays (student_id, room_no, check_in_date, check_out_date, fees_paid, fees_due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, room_no || '', check_in_date || '', check_out_date || '', fees_paid || '', fees_due_date || '', notes || '');

  res.status(201).json(getStudentWithStays(req.params.id));
});

app.put('/api/stays/:id', (req, res) => {
  const stay = db.prepare('SELECT * FROM stays WHERE id = ?').get(req.params.id);
  if (!stay) return res.status(404).json({ error: 'Not found' });

  const { room_no, check_in_date, check_out_date, fees_paid, fees_due_date, notes } = req.body;
  db.prepare(`
    UPDATE stays SET room_no = ?, check_in_date = ?, check_out_date = ?, fees_paid = ?, fees_due_date = ?, notes = ?
    WHERE id = ?
  `).run(room_no || '', check_in_date || '', check_out_date || '', fees_paid || '', fees_due_date || '', notes || '', req.params.id);

  res.json(getStudentWithStays(stay.student_id));
});

app.delete('/api/stays/:id', (req, res) => {
  const stay = db.prepare('SELECT * FROM stays WHERE id = ?').get(req.params.id);
  if (!stay) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM stays WHERE id = ?').run(req.params.id);
  res.json(getStudentWithStays(stay.student_id));
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Somnath Boys Hostal records running at http://localhost:${PORT}`);
});
