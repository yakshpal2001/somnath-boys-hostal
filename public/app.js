const searchInput = document.getElementById('searchInput');
const studentList = document.getElementById('studentList');
const resultCount = document.getElementById('resultCount');
const addBtn = document.getElementById('addBtn');
const reminderSection = document.getElementById('reminderSection');
const reminderList = document.getElementById('reminderList');

const studentModal = document.getElementById('studentModal');
const studentForm = document.getElementById('studentForm');
const studentModalTitle = document.getElementById('studentModalTitle');
const initialStayFields = document.getElementById('initialStayFields');
const cancelStudentBtn = document.getElementById('cancelStudentBtn');

const stayModal = document.getElementById('stayModal');
const stayForm = document.getElementById('stayForm');
const stayModalTitle = document.getElementById('stayModalTitle');
const cancelStayBtn = document.getElementById('cancelStayBtn');

const detailModal = document.getElementById('detailModal');
const detailName = document.getElementById('detailName');
const detailInfo = document.getElementById('detailInfo');
const stayTableBody = document.getElementById('stayTableBody');
const closeDetailBtn = document.getElementById('closeDetailBtn');
const editStudentBtn = document.getElementById('editStudentBtn');
const addStayBtn = document.getElementById('addStayBtn');
const deleteStudentBtn = document.getElementById('deleteStudentBtn');

let currentStudentId = null;
let searchDebounce = null;

async function api(url, opts) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
  } catch (networkErr) {
    throw new Error(`Could not reach server (${networkErr.message}). Is it running?`);
  }
  if (!res.ok) {
    const rawText = await res.text().catch(() => '');
    let body = {};
    try { body = JSON.parse(rawText); } catch (_) { /* not JSON */ }
    throw new Error(body.error || `Request failed (HTTP ${res.status}): ${rawText.slice(0, 200) || res.statusText}`);
  }
  return res.json();
}

function fmtDate(d) {
  if (!d) return '-';
  return d;
}

function stayStatus(stays) {
  if (!stays || stays.length === 0) return { text: 'No record', cls: 'no-record' };
  const latest = stays[0];
  if (latest.check_in_date && !latest.check_out_date) return { text: 'Currently staying', cls: 'staying' };
  if (latest.check_out_date) return { text: 'Checked out', cls: 'checked-out' };
  return { text: 'No record', cls: 'no-record' };
}

const DUE_SOON_DAYS = 3;

function paymentStatus(stays) {
  if (!stays || stays.length === 0) return null;
  const latest = stays[0];
  if (!latest.fees_due_date) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(latest.fees_due_date);
  if (isNaN(due.getTime())) return null;

  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return { text: 'Payment Overdue', cls: 'overdue', diffDays };
  if (diffDays <= DUE_SOON_DAYS) return { text: 'Payment Due Soon', cls: 'due-soon', diffDays };
  return null;
}

function renderList(students) {
  studentList.innerHTML = '';
  if (students.length === 0) {
    studentList.innerHTML = '<div class="empty-state">No students found.</div>';
    resultCount.textContent = '';
    renderReminders(students);
    return;
  }
  resultCount.textContent = `${students.length} student${students.length > 1 ? 's' : ''} found`;

  students.forEach((s) => {
    const status = stayStatus(s.stays);
    const payment = paymentStatus(s.stays);
    const latest = s.stays && s.stays[0];
    const card = document.createElement('div');
    card.className = 'student-card';
    card.innerHTML = `
      <div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="meta">${latest ? `Room ${escapeHtml(latest.room_no || '-')} &middot; Check-in: ${fmtDate(latest.check_in_date)}` : (s.phone ? escapeHtml(s.phone) : 'No stay record yet')}</div>
      </div>
      <div class="card-badges">
        <span class="badge ${status.cls}">${status.text}</span>
        ${payment ? `<span class="badge ${payment.cls}">${payment.text}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => openDetail(s.id));
    studentList.appendChild(card);
  });

  renderReminders(students);
}

function renderReminders(students) {
  const reminders = students
    .map((s) => ({ student: s, payment: paymentStatus(s.stays) }))
    .filter((r) => r.payment)
    .sort((a, b) => a.payment.diffDays - b.payment.diffDays);

  if (reminders.length === 0) {
    reminderSection.classList.add('hidden');
    reminderList.innerHTML = '';
    return;
  }

  reminderSection.classList.remove('hidden');
  reminderList.innerHTML = '';
  reminders.forEach(({ student, payment }) => {
    const latest = student.stays[0];
    const item = document.createElement('div');
    item.className = 'reminder-item';
    item.innerHTML = `
      <div>
        <div class="name">${escapeHtml(student.name)}</div>
        <div class="meta">Room ${escapeHtml(latest.room_no || '-')} &middot; Due: ${fmtDate(latest.fees_due_date)}</div>
      </div>
      <span class="badge ${payment.cls}">${payment.text}</span>
    `;
    item.addEventListener('click', () => openDetail(student.id));
    reminderList.appendChild(item);
  });
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadStudents(query = '') {
  const students = await api(`/api/students?q=${encodeURIComponent(query)}`);
  renderList(students);
}

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadStudents(searchInput.value.trim()), 200);
});

// ---- Add / Edit Student ----
function openAddStudent() {
  studentModalTitle.textContent = 'Add Student';
  studentForm.reset();
  document.getElementById('studentId').value = '';
  initialStayFields.classList.remove('hidden');
  studentModal.classList.remove('hidden');
}

function openEditStudent(student) {
  studentModalTitle.textContent = 'Edit Student Details';
  document.getElementById('studentId').value = student.id;
  document.getElementById('f_name').value = student.name || '';
  document.getElementById('f_father').value = student.father_name || '';
  document.getElementById('f_phone').value = student.phone || '';
  document.getElementById('f_idtype').value = student.id_proof_type || '';
  document.getElementById('f_idnumber').value = student.id_proof_number || '';
  document.getElementById('f_address').value = student.address || '';
  initialStayFields.classList.add('hidden');
  studentModal.classList.remove('hidden');
}

addBtn.addEventListener('click', openAddStudent);
cancelStudentBtn.addEventListener('click', () => studentModal.classList.add('hidden'));

studentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('studentId').value;
  const payload = {
    name: document.getElementById('f_name').value,
    father_name: document.getElementById('f_father').value,
    phone: document.getElementById('f_phone').value,
    id_proof_type: document.getElementById('f_idtype').value,
    id_proof_number: document.getElementById('f_idnumber').value,
    address: document.getElementById('f_address').value,
  };

  try {
    if (id) {
      await api(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      studentModal.classList.add('hidden');
      await openDetail(id);
    } else {
      payload.room_no = document.getElementById('f_room').value;
      payload.check_in_date = document.getElementById('f_checkin').value;
      payload.check_out_date = document.getElementById('f_checkout').value;
      payload.fees_paid = document.getElementById('f_fees').value;
      payload.fees_due_date = document.getElementById('f_duedate').value;
      payload.notes = document.getElementById('f_notes').value;
      await api('/api/students', { method: 'POST', body: JSON.stringify(payload) });
      studentModal.classList.add('hidden');
      searchInput.value = '';
      await loadStudents();
    }
  } catch (err) {
    alert(err.message);
  }
});

// ---- Detail View ----
async function openDetail(id) {
  const student = await api(`/api/students/${id}`);
  currentStudentId = student.id;
  detailName.textContent = student.name;
  detailInfo.innerHTML = `
    <div><span class="label">Father's / Guardian's Name</span>${escapeHtml(student.father_name) || '-'}</div>
    <div><span class="label">Phone</span>${escapeHtml(student.phone) || '-'}</div>
    <div><span class="label">ID Proof</span>${escapeHtml(student.id_proof_type) || '-'} ${escapeHtml(student.id_proof_number) || ''}</div>
    <div><span class="label">Address</span>${escapeHtml(student.address) || '-'}</div>
    <div><span class="label">Record added</span>${escapeHtml(student.created_at)}</div>
  `;

  stayTableBody.innerHTML = '';
  if (student.stays.length === 0) {
    stayTableBody.innerHTML = '<tr><td colspan="7" style="color:#6b7280;">No check-in records yet.</td></tr>';
  } else {
    student.stays.forEach((stay) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(stay.room_no) || '-'}</td>
        <td>${fmtDate(stay.check_in_date)}</td>
        <td>${fmtDate(stay.check_out_date)}</td>
        <td>${escapeHtml(stay.fees_paid) || '-'}</td>
        <td>${fmtDate(stay.fees_due_date)}</td>
        <td>${escapeHtml(stay.notes) || '-'}</td>
        <td class="actions-cell">
          <button class="btn" data-edit-stay="${stay.id}">Edit</button>
          <button class="btn danger" data-delete-stay="${stay.id}">Delete</button>
        </td>
      `;
      stayTableBody.appendChild(tr);
    });
  }

  detailModal.classList.remove('hidden');
  detailModal.dataset.studentCache = JSON.stringify(student);
}

closeDetailBtn.addEventListener('click', async () => {
  detailModal.classList.add('hidden');
  await loadStudents(searchInput.value.trim());
});

editStudentBtn.addEventListener('click', () => {
  const student = JSON.parse(detailModal.dataset.studentCache);
  detailModal.classList.add('hidden');
  openEditStudent(student);
});

deleteStudentBtn.addEventListener('click', async () => {
  const student = JSON.parse(detailModal.dataset.studentCache);
  if (!confirm(`Delete all records for "${student.name}"? This cannot be undone.`)) return;
  await api(`/api/students/${student.id}`, { method: 'DELETE' });
  detailModal.classList.add('hidden');
  await loadStudents(searchInput.value.trim());
});

// ---- Stay add/edit/delete ----
addStayBtn.addEventListener('click', () => {
  stayModalTitle.textContent = 'New Check-in Record';
  stayForm.reset();
  document.getElementById('stayId').value = '';
  document.getElementById('stayStudentId').value = currentStudentId;
  stayModal.classList.remove('hidden');
});

stayTableBody.addEventListener('click', (e) => {
  const editId = e.target.getAttribute('data-edit-stay');
  const delId = e.target.getAttribute('data-delete-stay');
  if (editId) {
    const student = JSON.parse(detailModal.dataset.studentCache);
    const stay = student.stays.find((s) => String(s.id) === editId);
    stayModalTitle.textContent = 'Edit Check-in Record';
    document.getElementById('stayId').value = stay.id;
    document.getElementById('stayStudentId').value = student.id;
    document.getElementById('s_room').value = stay.room_no || '';
    document.getElementById('s_checkin').value = stay.check_in_date || '';
    document.getElementById('s_checkout').value = stay.check_out_date || '';
    document.getElementById('s_fees').value = stay.fees_paid || '';
    document.getElementById('s_duedate').value = stay.fees_due_date || '';
    document.getElementById('s_notes').value = stay.notes || '';
    stayModal.classList.remove('hidden');
  } else if (delId) {
    (async () => {
      if (!confirm('Delete this check-in record?')) return;
      const student = await api(`/api/stays/${delId}`, { method: 'DELETE' });
      detailModal.dataset.studentCache = JSON.stringify(student);
      await openDetail(student.id);
    })();
  }
});

cancelStayBtn.addEventListener('click', () => stayModal.classList.add('hidden'));

stayForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const stayId = document.getElementById('stayId').value;
  const studentId = document.getElementById('stayStudentId').value;
  const payload = {
    room_no: document.getElementById('s_room').value,
    check_in_date: document.getElementById('s_checkin').value,
    check_out_date: document.getElementById('s_checkout').value,
    fees_paid: document.getElementById('s_fees').value,
    fees_due_date: document.getElementById('s_duedate').value,
    notes: document.getElementById('s_notes').value,
  };

  try {
    let student;
    if (stayId) {
      student = await api(`/api/stays/${stayId}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      student = await api(`/api/students/${studentId}/stays`, { method: 'POST', body: JSON.stringify(payload) });
    }
    stayModal.classList.add('hidden');
    detailModal.dataset.studentCache = JSON.stringify(student);
    await openDetail(student.id);
  } catch (err) {
    alert(err.message);
  }
});

// Close modals when clicking outside
[studentModal, stayModal, detailModal].forEach((modal) => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

loadStudents();
