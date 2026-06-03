import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FixedClock } from './core/clock.js';
import { SequentialIdGenerator } from './core/ids.js';
import { InMemoryRepository } from './storage/memoryStore.js';
import { AuditLog, AuditAction } from './audit/auditLog.js';
import { Department } from './core/enums.js';
import {
  Patient,
  PatientState,
  calculatePriorityScore,
  getSLATargets,
  validateStateTransition,
} from './clinical/patient.js';
import {
  Bed,
  BedStatus,
  BedType,
  checkIsolationEnforcement,
  validateBedStatusTransition,
} from './clinical/ward.js';
import { Clinician, StaffStatus } from './clinical/staff.js';
import { verifyAllergies } from './clinical/order.js';
import { MedicationStock, StockStatus, InventoryLocation, verifyDispensation } from './clinical/pharmacy.js';
import { calculateBedOccupancy, calculateSLAAttainment } from './analytics/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '../public');

// Setup application database state
const clock = new FixedClock('2026-06-04T08:00:00.000Z');
const ids = new SequentialIdGenerator();
const auditLog = new AuditLog(clock, ids);

const patientRepo = new InMemoryRepository<Patient>('Patient');
const bedRepo = new InMemoryRepository<Bed>('Bed');
const staffRepo = new InMemoryRepository<Clinician>('Clinician');
const medRepo = new InMemoryRepository<MedicationStock>('Medication');

// Populate Initial Seed Data
const initSeeds = () => {
  // Beds
  const bedTypes = [BedType.General, BedType.ICU, BedType.Isolation, BedType.Maternity, BedType.Surgical];
  bedTypes.forEach((type, idx) => {
    const id = ids.next('bed');
    bedRepo.save({
      id,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
      wardId: `ward_${type.toLowerCase()}`,
      roomId: `room_10${idx + 1}`,
      bedNumber: `${idx + 1}A`,
      type,
      status: BedStatus.Available,
      isolationPrecautions: type === BedType.Isolation ? ['Contact', 'Droplet'] : [],
    });
  });

  // Clinicians
  const staffData = [
    { name: 'Dr. Sarah Connor', specialty: 'Cardiology', dept: Department.Emergency },
    { name: 'Dr. Gregory House', specialty: 'Diagnostics', dept: Department.General },
    { name: 'Nurse Joy', specialty: 'General Nursing', dept: Department.General },
    { name: 'Pharmacist Kyle', specialty: 'Pharmacotherapy', dept: Department.Pharmacy },
  ];
  staffData.forEach((s) => {
    const id = ids.next('staff');
    staffRepo.save({
      id,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
      name: s.name,
      specialty: s.specialty,
      licenseNumber: `L-${Math.floor(10000 + Math.random() * 90000)}`,
      certExpiry: '2028-12-31',
      status: StaffStatus.OnDuty,
      department: s.dept,
    });
  });

  // Meds
  const meds = [
    { name: 'Nitroglycerin', isHighAlert: true, isControlled: false },
    { name: 'Morphine', isHighAlert: true, isControlled: true },
    { name: 'Ibuprofen', isHighAlert: false, isControlled: false },
  ];
  meds.forEach((m) => {
    const id = ids.next('med');
    medRepo.save({
      id,
      createdAt: clock.nowIso(),
      updatedAt: clock.nowIso(),
      itemName: m.name,
      quantity: 50,
      location: InventoryLocation.Formulary,
      status: StockStatus.InStock,
      isHighAlert: m.isHighAlert,
      isControlled: m.isControlled,
    });
  });
};

initSeeds();

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const method = req.method;

  // Set JSON headers for API
  const sendJSON = (statusCode: number, data: unknown) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const sendError = (statusCode: number, message: string) => {
    sendJSON(statusCode, { error: message });
  };

  // Serve static files
  if (method === 'GET' && !url.pathname.startsWith('/api')) {
    let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.js') contentType = 'text/javascript';
    if (ext === '.json') contentType = 'application/json';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // API Endpoints
  // Patients
  if (method === 'GET' && url.pathname === '/api/patients') {
    return sendJSON(200, patientRepo.getAll());
  }

  if (method === 'POST' && url.pathname === '/api/patients/register') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload.name || !payload.birthdate) {
          return sendError(400, 'Missing name or birthdate');
        }

        const id = ids.next('pat');
        const p: Patient = {
          id,
          createdAt: clock.nowIso(),
          updatedAt: clock.nowIso(),
          name: payload.name,
          gender: payload.gender || 'U',
          birthdate: payload.birthdate,
          presentingComplaint: payload.presentingComplaint || 'None',
          arrivalSource: payload.arrivalSource || 'WalkIn',
          state: PatientState.Registered,
          comorbidities: payload.comorbidities ? payload.comorbidities.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
        };

        const saved = patientRepo.save(p);
        auditLog.record({
          entityType: 'Patient',
          entityId: id,
          action: AuditAction.Create,
          actorId: 'system',
          actorRole: 'Admin',
          after: saved,
        });

        sendJSON(201, saved);
      } catch (err) {
        sendError(500, (err as Error).message);
      }
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/patients/triage') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { patientId, triageLevel } = payload;
        if (!patientId || !triageLevel) {
          return sendError(400, 'Missing patientId or triageLevel');
        }

        const p = patientRepo.require(patientId);
        const before = structuredClone(p);

        validateStateTransition(p.state, PatientState.Triaged);
        p.state = PatientState.Triaged;
        p.triageLevel = triageLevel;
        p.triageTime = clock.nowIso();
        p.priorityScore = calculatePriorityScore(triageLevel, p.birthdate, p.comorbidities, clock.now());

        const SLAs = getSLATargets(triageLevel, p.triageTime);
        p.triageToDoctorSLA = SLAs.triageToDoctorSLA;
        p.triageToBedSLA = SLAs.triageToBedSLA;
        p.updatedAt = clock.nowIso();

        const saved = patientRepo.save(p);
        auditLog.record({
          entityType: 'Patient',
          entityId: patientId,
          action: AuditAction.Update,
          actorId: 'staff_001',
          actorRole: 'Nurse',
          before,
          after: saved,
          reason: 'Patient Triaged',
        });

        sendJSON(200, saved);
      } catch (err) {
        sendError(400, (err as Error).message);
      }
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/patients/admit') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { patientId, bedId } = payload;
        if (!patientId || !bedId) {
          return sendError(400, 'Missing patientId or bedId');
        }

        const p = patientRepo.require(patientId);
        const b = bedRepo.require(bedId);

        const beforePatient = structuredClone(p);
        const beforeBed = structuredClone(b);

        validateStateTransition(p.state, PatientState.Admitted);
        validateBedStatusTransition(b.status, BedStatus.Occupied);

        // Check isolation rules
        const isPatientInfectious = p.comorbidities.some(c => c.toLowerCase().includes('covid') || c.toLowerCase().includes('mrsa'));
        checkIsolationEnforcement(b, isPatientInfectious);

        // Mutate states
        b.status = BedStatus.Occupied;
        b.assignedPatientId = patientId;
        b.updatedAt = clock.nowIso();
        bedRepo.save(b);

        p.state = PatientState.Admitted;
        p.assignedBedId = bedId;
        p.admittedAt = clock.nowIso();
        p.updatedAt = clock.nowIso();
        const savedPatient = patientRepo.save(p);

        auditLog.record({
          entityType: 'BedAllocation',
          entityId: bedId,
          action: AuditAction.Update,
          actorId: 'staff_002',
          actorRole: 'Clinician',
          before: { patient: beforePatient, bed: beforeBed },
          after: { patient: savedPatient, bed: b },
          reason: 'Patient Admitted to Bed',
        });

        sendJSON(200, savedPatient);
      } catch (err) {
        sendError(400, (err as Error).message);
      }
    });
    return;
  }

  // Beds
  if (method === 'GET' && url.pathname === '/api/beds') {
    return sendJSON(200, bedRepo.getAll());
  }

  // Meds Inventory & Dispensing
  if (method === 'GET' && url.pathname === '/api/pharmacy') {
    return sendJSON(200, medRepo.getAll());
  }

  if (method === 'POST' && url.pathname === '/api/pharmacy/dispense') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { medId, patientId, verifierRole } = payload;
        if (!medId || !patientId) {
          return sendError(400, 'Missing medId or patientId');
        }

        const med = medRepo.require(medId);
        const p = patientRepo.require(patientId);

        const beforeMed = structuredClone(med);

        // Allergy check
        verifyAllergies(p.comorbidities, med.itemName);

        // Verification check
        verifyDispensation(med, 1, 'Pharmacist', verifierRole || undefined);

        med.quantity -= 1;
        if (med.quantity === 0) {
          med.status = StockStatus.OutOfStock;
        } else if (med.quantity < 10) {
          med.status = StockStatus.LowStock;
        }
        med.updatedAt = clock.nowIso();
        const savedMed = medRepo.save(med);

        // Record co-sign in audit
        auditLog.record({
          entityType: 'Medication',
          entityId: medId,
          action: verifierRole ? AuditAction.Override : AuditAction.Update,
          actorId: 'pharm_001',
          actorRole: 'Pharmacist',
          before: beforeMed,
          after: savedMed,
          reason: verifierRole ? `Medication Dispensed (Dual Verified by ${verifierRole})` : 'Medication Dispensed',
        });

        sendJSON(200, { success: true, medication: savedMed });
      } catch (err) {
        sendError(400, (err as Error).message);
      }
    });
    return;
  }

  // Audit Trails
  if (method === 'GET' && url.pathname === '/api/audit') {
    return sendJSON(200, auditLog.all().reverse()); // Newest first
  }

  // Analytics KPIs
  if (method === 'GET' && url.pathname === '/api/analytics') {
    const beds = bedRepo.getAll();
    const patients = patientRepo.getAll();
    return sendJSON(200, {
      occupancy: calculateBedOccupancy(beds),
      sla: calculateSLAAttainment(patients),
      totalPatients: patients.length,
      totalBeds: beds.length,
    });
  }

  // Clinicians List
  if (method === 'GET' && url.pathname === '/api/staff') {
    return sendJSON(200, staffRepo.getAll());
  }

  sendError(404, 'Not Found');
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Hospital Operations Platform Web Server running!`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
