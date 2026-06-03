// State
let patients = [];
let beds = [];
let medications = [];

// Tab Navigation
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabContents.forEach((c) => c.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(`tab-${tabId}`).classList.add('active');

    // Fetch tab-specific data
    refreshData();
  });
});

// Fetch & Refresh Helper
async function refreshData() {
  await Promise.all([
    fetchPatients(),
    fetchBeds(),
    fetchMeds(),
    fetchAudit(),
    fetchAnalytics()
  ]);
}

// Patients API Calls & UI
async function fetchPatients() {
  try {
    const res = await fetch('/api/patients');
    patients = await res.json();
    renderPatients();
    updatePharmacySelects();
  } catch (err) {
    console.error('Error fetching patients:', err);
  }
}

function renderPatients() {
  const list = document.getElementById('patient-list');
  list.innerHTML = '';

  if (patients.length === 0) {
    list.innerHTML = '<p class="text-secondary" style="padding: 1rem;">No patients registered.</p>';
    return;
  }

  // Render sorted by priority score (descending) or state
  const sorted = [...patients].sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  sorted.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'patient-card';

    let actionButtons = '';
    if (p.state === 'Registered') {
      actionButtons = `<button class="btn secondary" onclick="openTriageModal('${p.id}')">Assess Triage</button>`;
    } else if (p.state === 'Triaged') {
      actionButtons = `<button class="btn primary" onclick="openAdmitModal('${p.id}')">Admit & Bed</button>`;
    } else if (p.state === 'Admitted') {
      const bed = beds.find((b) => b.id === p.assignedBedId);
      actionButtons = `<span class="text-secondary" style="font-size: 0.85rem;">Bed: ${bed ? bed.bedNumber : p.assignedBedId}</span>`;
    }

    const urgencyBadge = p.triageLevel 
      ? `<span class="badge-urgency urgency-${p.triageLevel}">${p.triageLevel}</span>`
      : '';

    const priorityBadge = p.priorityScore !== undefined
      ? `<span class="badge" style="background: rgba(99, 102, 241, 0.1); border-color: rgba(99, 102, 241, 0.2);">Priority: ${p.priorityScore}</span>`
      : '';

    card.innerHTML = `
      <div class="patient-info">
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
          <h4>${p.name}</h4>
          <span class="badge-state state-${p.state.toLowerCase()}">${p.state}</span>
        </div>
        <div class="patient-meta">
          <span>DOB: ${p.birthdate}</span>
          <span>Gender: ${p.gender}</span>
          <span>Complaint: <em>${p.presentingComplaint}</em></span>
          ${p.comorbidities.length ? `<span>Comorbidities: <strong>${p.comorbidities.join(', ')}</strong></span>` : ''}
        </div>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem; align-items: center;">
          ${urgencyBadge}
          ${priorityBadge}
        </div>
      </div>
      <div class="patient-actions">
        ${actionButtons}
      </div>
    `;
    list.appendChild(card);
  });
}

// Register Form Submit
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('p-name').value;
  const gender = document.getElementById('p-gender').value;
  const birthdate = document.getElementById('p-birthdate').value;
  const presentingComplaint = document.getElementById('p-complaint').value;
  const arrivalSource = document.getElementById('p-source').value;
  const comorbidities = document.getElementById('p-comorbidities').value;

  try {
    const res = await fetch('/api/patients/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, gender, birthdate, presentingComplaint, arrivalSource, comorbidities }),
    });

    if (res.ok) {
      document.getElementById('register-form').reset();
      refreshData();
    } else {
      const errData = await res.json();
      alert(`Registration Failed: ${errData.error}`);
    }
  } catch (err) {
    console.error('Error registering patient:', err);
  }
});

// Triage Assessment Actions
function openTriageModal(patId) {
  document.getElementById('triage-pat-id').value = patId;
  document.getElementById('triage-modal').style.display = 'flex';
}

async function submitTriage() {
  const patientId = document.getElementById('triage-pat-id').value;
  const triageLevel = document.getElementById('triage-level').value;

  try {
    const res = await fetch('/api/patients/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, triageLevel }),
    });

    if (res.ok) {
      closeModal('triage-modal');
      refreshData();
    } else {
      const data = await res.json();
      alert(`Triage Failed: ${data.error}`);
    }
  } catch (err) {
    console.error(err);
  }
}

// Bed Assignment Actions
function openAdmitModal(patId) {
  document.getElementById('bed-pat-id').value = patId;
  const select = document.getElementById('assign-bed-id');
  select.innerHTML = '';

  const availBeds = beds.filter((b) => b.status === 'Available');
  if (availBeds.length === 0) {
    select.innerHTML = '<option value="">-- No Beds Available --</option>';
  } else {
    availBeds.forEach((b) => {
      select.innerHTML += `<option value="${b.id}">${b.bedNumber} - ${b.type} (${b.roomId})</option>`;
    });
  }

  document.getElementById('bed-modal').style.display = 'flex';
}

async function submitBedAssignment() {
  const patientId = document.getElementById('bed-pat-id').value;
  const bedId = document.getElementById('assign-bed-id').value;

  if (!bedId) {
    alert('Please select a bed first.');
    return;
  }

  try {
    const res = await fetch('/api/patients/admit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId, bedId }),
    });

    if (res.ok) {
      closeModal('bed-modal');
      refreshData();
    } else {
      const data = await res.json();
      alert(`Admission Failed: ${data.error}`);
    }
  } catch (err) {
    console.error(err);
  }
}

// Beds List API & UI
async function fetchBeds() {
  try {
    const res = await fetch('/api/beds');
    beds = await res.json();
    renderBeds();
  } catch (err) {
    console.error(err);
  }
}

function renderBeds() {
  const grid = document.getElementById('bed-grid');
  grid.innerHTML = '';

  beds.forEach((b) => {
    const card = document.createElement('div');
    card.className = `bed-card status-${b.status}`;

    let patientSection = '<div class="bed-patient text-secondary">Empty</div>';
    if (b.status === 'Occupied' && b.assignedPatientId) {
      const pat = patients.find((p) => p.id === b.assignedPatientId);
      patientSection = `
        <div class="bed-patient">
          <small class="text-secondary">Patient:</small>
          <strong>${pat ? pat.name : b.assignedPatientId}</strong>
        </div>
      `;
    }

    const precautions = b.isolationPrecautions.length 
      ? `<div style="margin-top: 0.25rem;"><span class="badge-alert">${b.isolationPrecautions.join(', ')}</span></div>`
      : '';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <h4>Bed ${b.bedNumber}</h4>
        <span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.05);">${b.status}</span>
      </div>
      <div class="bed-type">${b.type} • Room ${b.roomId}</div>
      ${precautions}
      ${patientSection}
    `;
    grid.appendChild(card);
  });
}

// Meds Inventory API & UI
async function fetchMeds() {
  try {
    const res = await fetch('/api/pharmacy');
    medications = await res.json();
    renderMeds();
  } catch (err) {
    console.error(err);
  }
}

function renderMeds() {
  const list = document.getElementById('med-list');
  list.innerHTML = '';

  medications.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'med-card';

    card.innerHTML = `
      <div class="med-info">
        <h4>${m.itemName}</h4>
        <div class="med-meta text-secondary" style="font-size: 0.8rem;">Location: ${m.location}</div>
        <div class="med-badges">
          ${m.isHighAlert ? '<span class="badge-alert">High-Alert</span>' : ''}
          ${m.isControlled ? '<span class="badge-controlled">Controlled</span>' : ''}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 1.25rem; font-weight: 600; color: ${m.quantity < 10 ? '#ef4444' : '#fff'};">${m.quantity}</div>
        <span class="badge" style="font-size: 0.65rem;">${m.status}</span>
      </div>
    `;
    list.appendChild(card);
  });
}

// Populate Dropdowns in Dispense Form
function updatePharmacySelects() {
  const medSelect = document.getElementById('dispense-med');
  const patSelect = document.getElementById('dispense-patient');

  medSelect.innerHTML = '';
  patSelect.innerHTML = '';

  medications.forEach((m) => {
    medSelect.innerHTML += `<option value="${m.id}">${m.itemName} (Stock: ${m.quantity})</option>`;
  });

  const admittedPatients = patients.filter((p) => p.state === 'Admitted');
  if (admittedPatients.length === 0) {
    patSelect.innerHTML = '<option value="">-- No Admitted Patients --</option>';
  } else {
    admittedPatients.forEach((p) => {
      patSelect.innerHTML += `<option value="${p.id}">${p.name} (${p.id})</option>`;
    });
  }

  // Trigger double-verification logic toggle on change
  toggleVerifierRequirements();
}

function toggleVerifierRequirements() {
  const medSelect = document.getElementById('dispense-med');
  const selectedMed = medications.find((m) => m.id === medSelect.value);
  const verifierGroup = document.getElementById('verifier-group');

  if (selectedMed && selectedMed.isHighAlert) {
    verifierGroup.classList.remove('hidden');
  } else {
    verifierGroup.classList.add('hidden');
  }
}

document.getElementById('dispense-med').addEventListener('change', toggleVerifierRequirements);

document.getElementById('dispense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const medId = document.getElementById('dispense-med').value;
  const patientId = document.getElementById('dispense-patient').value;
  const verifierRole = document.getElementById('dispense-verifier').value;

  if (!medId || !patientId) {
    alert('Select medication and patient first.');
    return;
  }

  try {
    const res = await fetch('/api/pharmacy/dispense', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medId, patientId, verifierRole }),
    });

    if (res.ok) {
      alert('Medication Dispensed successfully!');
      refreshData();
    } else {
      const data = await res.json();
      alert(`Dispensation Failed: ${data.error}`);
    }
  } catch (err) {
    console.error(err);
  }
});

// Audit Log API & UI
async function fetchAudit() {
  try {
    const res = await fetch('/api/audit');
    const logs = await res.json();
    renderAudit(logs);
  } catch (err) {
    console.error(err);
  }
}

function renderAudit(logs) {
  const list = document.getElementById('audit-log');
  list.innerHTML = '';

  if (logs.length === 0) {
    list.innerHTML = '<p class="text-secondary">No audit logs recorded.</p>';
    return;
  }

  logs.forEach((log) => {
    const card = document.createElement('div');
    card.className = 'audit-entry';

    card.innerHTML = `
      <div class="audit-meta">
        <strong>[${log.action}]</strong> on <strong>${log.entityType}</strong> (ID: ${log.entityId})
        at ${log.timestamp} by ${log.actorId} (${log.actorRole})
      </div>
      <div>Reason: ${log.reason || 'Not specified'}</div>
      <pre class="audit-snapshot">${JSON.stringify(log.after || log.before, null, 2)}</pre>
    `;
    list.appendChild(card);
  });
}

// Analytics KPI API & UI
async function fetchAnalytics() {
  try {
    const res = await fetch('/api/analytics');
    const data = await res.json();

    document.getElementById('metric-occupancy').innerText = `${Math.round(data.occupancy * 100)}%`;
    document.getElementById('occupancy-progress').style.width = `${Math.round(data.occupancy * 100)}%`;

    const rate = Math.round(data.sla.triageToDoctorRate * 100);
    document.getElementById('metric-sla').innerText = `${rate}%`;
    document.getElementById('metric-sla-sub').innerText = `${data.sla.triageToDoctorMet} of ${data.sla.triageToDoctorTotal} patients met target`;

    document.getElementById('metric-patients').innerText = data.totalPatients;
  } catch (err) {
    console.error(err);
  }
}

// Modal Helpers
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// Initial Load
refreshData();
setInterval(refreshData, 10000); // Autorefresh every 10s
