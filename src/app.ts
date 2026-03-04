import { FixedClock } from './core/clock';
import { SequentialIdGenerator } from './core/ids';
import { InMemoryRepository } from './storage/memoryStore';
import { Department } from './core/enums';
import {
  Patient,
  PatientState,
  TriageLevel,
  calculatePriorityScore,
  getSLATargets,
} from './clinical/patient';
import {
  Bed,
  BedStatus,
  BedType,
  checkIsolationEnforcement,
} from './clinical/ward';
import {
  Clinician,
  StaffStatus,
  verifyCredentials,
} from './clinical/staff';
import {
  ClinicalOrder,
  OrderStatus,
  OrderType,
  verifyAllergies,
} from './clinical/order';
import {
  MedicationStock,
  StockStatus,
  InventoryLocation,
  verifyDispensation,
} from './clinical/pharmacy';
import {
  calculateBedOccupancy,
  calculateSLAAttainment,
} from './analytics/analytics';
import { getRulepack } from './rules/rulepackIndex';

export function runDemo(): void {
  console.log('--- STARTING HOSPITAL OPERATIONS E2E DEMO ---');

  // 1. Scaffold core services
  const clock = new FixedClock('2026-06-04T08:00:00.000Z');
  const ids = new SequentialIdGenerator();

  // 2. Setup repos
  const patientRepo = new InMemoryRepository<Patient>('Patient');
  const bedRepo = new InMemoryRepository<Bed>('Bed');
  const staffRepo = new InMemoryRepository<Clinician>('Clinician');
  const orderRepo = new InMemoryRepository<ClinicalOrder>('Order');
  const medRepo = new InMemoryRepository<MedicationStock>('Medication');

  // 3. Register patient & Triage
  console.log('Registering and triaging a patient...');
  const patientId = ids.next('pat');
  const newPatient: Patient = {
    id: patientId,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    name: 'John Doe',
    gender: 'M',
    birthdate: '1955-11-12', // >65 age risk
    presentingComplaint: 'Severe chest pressure and radiating arm pain',
    arrivalSource: 'Ambulance',
    state: PatientState.Registered,
    comorbidities: ['Diabetes'],
  };
  patientRepo.save(newPatient);

  // Apply rulepack pack-05
  const rulepack = getRulepack('pack-05');
  console.log(`Using rulepack configuration: ${rulepack.name}`);

  // Perform Triage
  clock.advanceMinutes(5);
  const triagedPatient = patientRepo.require(patientId);
  triagedPatient.state = PatientState.Triaged;
  triagedPatient.triageLevel = TriageLevel.Immediate;
  triagedPatient.triageTime = clock.nowIso();
  triagedPatient.priorityScore = calculatePriorityScore(
    TriageLevel.Immediate,
    triagedPatient.birthdate,
    triagedPatient.comorbidities,
    clock.now(),
  );

  const SLAs = getSLATargets(TriageLevel.Immediate, triagedPatient.triageTime);
  triagedPatient.triageToDoctorSLA = SLAs.triageToDoctorSLA;
  triagedPatient.triageToBedSLA = SLAs.triageToBedSLA;
  patientRepo.save(triagedPatient);
  console.log(`Patient priority score: ${triagedPatient.priorityScore}, Doctor SLA: ${triagedPatient.triageToDoctorSLA}`);

  // 4. Bed Management
  console.log('Setting up ICU beds and checking isolation precautions...');
  const bedId = ids.next('bed');
  const icuBed: Bed = {
    id: bedId,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    wardId: 'ward_icu_1',
    roomId: 'room_101',
    bedNumber: '1',
    type: BedType.ICU,
    status: BedStatus.Available,
    isolationPrecautions: ['Contact'],
  };
  bedRepo.save(icuBed);

  // Verify and Assign Bed
  checkIsolationEnforcement(icuBed, false); // Not infectious
  icuBed.status = BedStatus.Occupied;
  icuBed.assignedPatientId = patientId;
  bedRepo.save(icuBed);

  triagedPatient.state = PatientState.Admitted;
  triagedPatient.assignedBedId = bedId;
  triagedPatient.admittedAt = clock.nowIso();
  patientRepo.save(triagedPatient);
  console.log(`Patient successfully admitted to bed: ${bedId}`);

  // 5. Staff check
  console.log('Verifying cardiologist credentials...');
  const staffId = ids.next('staff');
  const cardiologist: Clinician = {
    id: staffId,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    name: 'Dr. Sarah Connor',
    specialty: 'Cardiology',
    licenseNumber: 'L-77482',
    certExpiry: '2028-12-31',
    status: StaffStatus.OnDuty,
    department: Department.General,
  };
  staffRepo.save(cardiologist);

  verifyCredentials(cardiologist, clock.now());
  console.log(`Cardiologist credentials verified. License ${cardiologist.licenseNumber}`);

  // 6. Medication Order with allergy check
  console.log('Ordering and dispensing medications...');
  verifyAllergies(triagedPatient.comorbidities, 'Nitroglycerin'); // John Doe is not allergic to Nitroglycerin

  const orderId = ids.next('ord');
  const medOrder: ClinicalOrder = {
    id: orderId,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    patientId: patientId,
    orderType: OrderType.Medication,
    status: OrderStatus.Submitted,
    details: {
      itemName: 'Nitroglycerin',
      dosage: '0.4mg',
      route: 'SL',
      frequency: 'q5min x3',
    },
    orderedBy: staffId,
    verbalOrder: false,
  };
  orderRepo.save(medOrder);

  // Pharmacy check
  const stockId = ids.next('med');
  const nitroStock: MedicationStock = {
    id: stockId,
    createdAt: clock.nowIso(),
    updatedAt: clock.nowIso(),
    itemName: 'Nitroglycerin',
    quantity: 100,
    location: InventoryLocation.Formulary,
    status: StockStatus.InStock,
    isHighAlert: true, // Requires double verification
    isControlled: false,
  };
  medRepo.save(nitroStock);

  verifyDispensation(nitroStock, 1, 'Pharmacist', 'ChiefMedicalOfficer');
  nitroStock.quantity -= 1;
  medRepo.save(nitroStock);
  console.log('Nitroglycerin successfully double-verified and dispensed.');

  // 7. Analytics
  console.log('Calculating analytics metrics...');
  const occupancy = calculateBedOccupancy(bedRepo.getAll());
  const slaAttainment = calculateSLAAttainment(patientRepo.getAll());
  console.log(`ICU Occupancy: ${occupancy * 100}%, Triage-to-Doctor SLA attainment: ${slaAttainment.triageToDoctorRate * 100}%`);

  console.log('--- DEMO RUN COMPLETED SUCCESSFULLY ---');
}

runDemo();

