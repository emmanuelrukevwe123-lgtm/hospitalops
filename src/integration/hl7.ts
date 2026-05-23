/**
 * Simplified HL7 v2.x message builder and parser for common hospital integration segments.
 * Covers ADT (Admission/Discharge/Transfer), ORU (Lab Results), ORM (Order Messages).
 */

import { validation } from '../core/errors';

export const HL7MessageType = {
  ADT_A01: 'ADT^A01', // Admit/Visit Notification
  ADT_A02: 'ADT^A02', // Transfer
  ADT_A03: 'ADT^A03', // Discharge
  ADT_A04: 'ADT^A04', // Register
  ADT_A08: 'ADT^A08', // Update Patient Information
  ORM_O01: 'ORM^O01', // General Order
  ORU_R01: 'ORU^R01', // Unsolicited Observation Result
  RDE_O11: 'RDE^O11', // Pharmacy/Treatment Encoded Order
  SIU_S12: 'SIU^S12', // Notification of New Appointment Booking
} as const;
export type HL7MessageType = (typeof HL7MessageType)[keyof typeof HL7MessageType];

export interface HL7Field {
  value: string;
  components?: string[];
}

export interface HL7Segment {
  id: string;
  fields: string[];
}

export interface HL7Message {
  messageType: string;
  messageControlId: string;
  sendingApplication: string;
  sendingFacility: string;
  receivingApplication: string;
  receivingFacility: string;
  dateTime: string;
  processingId: 'P' | 'T' | 'D'; // Production, Training, Debug
  version: string;
  segments: HL7Segment[];
}

export interface ParsedADTMessage {
  messageType: string;
  patientId: string;
  patientName: { family: string; given: string };
  birthdate: string;
  gender: string;
  admitReason?: string;
  admitDateTime?: string;
  dischargeDateTime?: string;
  attendingDoctorId?: string;
  wardId?: string;
  bedId?: string;
}

export interface ParsedORUMessage {
  patientId: string;
  orderId: string;
  observationDateTime: string;
  observations: ORUObservation[];
  reportStatus: 'F' | 'P' | 'C'; // Final, Preliminary, Corrected
}

export interface ORUObservation {
  identifier: string;
  value: string;
  units: string;
  referenceRange?: string;
  abnormalFlag?: 'L' | 'H' | 'LL' | 'HH' | 'N' | 'A';
  observationStatus: 'F' | 'P' | 'C';
  dateTime: string;
}

const FIELD_SEPARATOR = '|';
const COMPONENT_SEPARATOR = '^';
const REPETITION_SEPARATOR = '~';
const ESCAPE_CHARACTER = '\\';
const SUBCOMPONENT_SEPARATOR = '&';

export function buildMSH(
  messageType: string,
  messageControlId: string,
  sendingApp: string,
  sendingFacility: string,
  receivingApp: string,
  receivingFacility: string,
  dateTime: string,
  processingId: 'P' | 'T' | 'D' = 'P',
  version: string = '2.5',
): string {
  const fields = [
    'MSH',
    `${FIELD_SEPARATOR}${COMPONENT_SEPARATOR}${REPETITION_SEPARATOR}${ESCAPE_CHARACTER}${SUBCOMPONENT_SEPARATOR}`, // MSH.2 encoding chars
    sendingApp,
    sendingFacility,
    receivingApp,
    receivingFacility,
    dateTime,
    '',              // Security
    messageType,
    messageControlId,
    processingId,
    version,
  ];
  return fields.join(FIELD_SEPARATOR);
}

export function buildPID(
  patientId: string,
  familyName: string,
  givenName: string,
  birthdate: string,
  gender: string,
  addressLine?: string,
  phone?: string,
): string {
  const fields = [
    'PID',
    '1',                           // Set ID
    '',                            // Patient ID (external)
    patientId,                     // Patient ID (internal)
    '',                            // Alternate patient ID
    `${familyName}${COMPONENT_SEPARATOR}${givenName}`,
    '',                            // Mother's maiden name
    birthdate.replace(/-/g, ''),  // DOB YYYYMMDD
    gender,
    '',                            // Race
    addressLine ?? '',
    '',                            // County code
    phone ?? '',
  ];
  return fields.join(FIELD_SEPARATOR);
}

export function buildPV1(
  visitType: 'E' | 'I' | 'O' | 'P', // Emergency, Inpatient, Outpatient, Preadmit
  admitDateTime?: string,
  wardId?: string,
  bedId?: string,
  attendingDoctorId?: string,
  admitReason?: string,
  dischargeDateTime?: string,
  visitNumber?: string,
): string {
  const location = wardId && bedId ? `${wardId}${COMPONENT_SEPARATOR}${bedId}` : '';
  const fields = [
    'PV1',
    '1',
    visitType,
    location,                    // Assigned patient location
    '',                          // Admission type
    '',                          // Preadmit number
    '',                          // Prior patient location
    attendingDoctorId ?? '',
    '',                          // Referring doctor
    '',                          // Consulting doctor
    '',                          // Hospital service
    '',                          // Temporary location
    '',                          // Preadmit test indicator
    '',                          // Readmission indicator
    '',                          // Admit source
    '',                          // Ambulatory status
    '',                          // VIP indicator
    '',                          // Admitting doctor
    '',                          // Patient type
    visitNumber ?? '',
    '',                          // Financial class
    '',                          // Charge price indicator
    '',                          // Courtesy code
    '',                          // Credit rating
    '',                          // Contract code
    '',                          // Contract effective date
    '',                          // Contract amount
    '',                          // Contract period
    '',                          // Interest code
    '',                          // Transfer to bad debt code
    '',                          // Transfer to bad debt date
    '',                          // Bad debt agency code
    '',                          // Bad debt transfer amount
    '',                          // Bad debt recovery amount
    '',                          // Delete account indicator
    '',                          // Delete account date
    '',                          // Discharge disposition
    '',                          // Discharged to location
    '',                          // Diet type
    '',                          // Servicing facility
    '',                          // Bed status
    '',                          // Account status
    '',                          // Pending location
    '',                          // Prior temporary location
    admitDateTime ?? '',
    dischargeDateTime ?? '',
  ];
  return fields.join(FIELD_SEPARATOR);
}

export function buildOBR(
  setId: number,
  orderId: string,
  testCode: string,
  testName: string,
  observationDateTime: string,
  orderingProviderId?: string,
  status: 'F' | 'P' | 'C' = 'F',
): string {
  const fields = [
    'OBR',
    String(setId),
    orderId,
    '',                          // Filler order number
    `${testCode}${COMPONENT_SEPARATOR}${testName}`,
    '',                          // Priority
    observationDateTime,
    observationDateTime,         // Observation date/time
    '',                          // Collection volume
    '',                          // Collector identifier
    '',                          // Specimen action code
    '',                          // Danger code
    '',                          // Relevant clinical info
    observationDateTime,         // Specimen received date/time
    '',                          // Specimen source
    orderingProviderId ?? '',
    '',                          // Order callback phone number
    '',                          // Placer field 1
    '',                          // Placer field 2
    '',                          // Filler field 1
    '',                          // Filler field 2
    observationDateTime,         // Results rpt/status chng date/time
    '',                          // Charge to practice
    '',                          // Diagnostic serv sect id
    status,
  ];
  return fields.join(FIELD_SEPARATOR);
}

export function buildOBX(
  setId: number,
  valueType: 'NM' | 'ST' | 'TX' | 'CE' | 'CWE',
  identifier: string,
  identifierName: string,
  value: string,
  units: string,
  referenceRange?: string,
  abnormalFlag?: string,
  observationStatus: 'F' | 'P' | 'C' = 'F',
  dateTime?: string,
): string {
  const fields = [
    'OBX',
    String(setId),
    valueType,
    `${identifier}${COMPONENT_SEPARATOR}${identifierName}`,
    '',                          // Observation sub-id
    value,
    units,
    referenceRange ?? '',
    abnormalFlag ?? '',
    '',                          // Probability
    '',                          // Nature of abnormal test
    observationStatus,
    '',                          // Effective date of normal ranges
    '',                          // User defined access checks
    dateTime ?? '',
  ];
  return fields.join(FIELD_SEPARATOR);
}

export function buildADTMessage(
  type: 'ADT^A01' | 'ADT^A03' | 'ADT^A04' | 'ADT^A08',
  patientId: string,
  patientName: { family: string; given: string },
  birthdate: string,
  gender: string,
  options: {
    messageControlId: string;
    dateTime: string;
    visitType?: 'E' | 'I' | 'O';
    admitDateTime?: string;
    dischargeDateTime?: string;
    wardId?: string;
    bedId?: string;
    attendingDoctorId?: string;
  },
): string {
  const segments: string[] = [];

  segments.push(buildMSH(
    type,
    options.messageControlId,
    'HospitalOps',
    'MainHospital',
    'ExternalSystem',
    'TargetFacility',
    options.dateTime,
  ));

  segments.push(buildPID(
    patientId,
    patientName.family,
    patientName.given,
    birthdate,
    gender,
  ));

  segments.push(buildPV1(
    options.visitType ?? 'I',
    options.admitDateTime,
    options.wardId,
    options.bedId,
    options.attendingDoctorId,
    undefined,
    options.dischargeDateTime,
  ));

  return segments.join('\r');
}

export function buildORUMessage(
  patientId: string,
  orderId: string,
  testCode: string,
  testName: string,
  observations: ORUObservation[],
  messageControlId: string,
  dateTime: string,
): string {
  const segments: string[] = [];

  segments.push(buildMSH(
    HL7MessageType.ORU_R01,
    messageControlId,
    'LaboratorySystem',
    'MainHospital',
    'HospitalOps',
    'TargetFacility',
    dateTime,
  ));

  segments.push(buildPID(patientId, '', '', '', ''));
  segments.push(buildOBR(1, orderId, testCode, testName, dateTime));

  observations.forEach((obs, idx) => {
    segments.push(buildOBX(
      idx + 1,
      'NM',
      obs.identifier,
      obs.identifier,
      obs.value,
      obs.units,
      obs.referenceRange,
      obs.abnormalFlag,
      obs.observationStatus,
      obs.dateTime,
    ));
  });

  return segments.join('\r');
}

export function parseHL7Message(rawMessage: string): HL7Segment[] {
  const segmentLines = rawMessage.split(/\r\n|\r|\n/).filter((l) => l.trim());
  return segmentLines.map((line) => {
    const fields = line.split(FIELD_SEPARATOR);
    return { id: fields[0], fields };
  });
}

export function extractPIDFromSegments(segments: HL7Segment[]): ParsedADTMessage['patientName'] & { patientId: string; birthdate: string; gender: string } {
  const pid = segments.find((s) => s.id === 'PID');
  if (!pid) throw validation('No PID segment found in HL7 message');

  const patientId = pid.fields[3] ?? '';
  const nameField = pid.fields[5] ?? '';
  const nameParts = nameField.split(COMPONENT_SEPARATOR);
  const birthdate = pid.fields[7] ?? '';
  const gender = pid.fields[8] ?? '';

  return {
    patientId,
    patientName: { family: nameParts[0] ?? '', given: nameParts[1] ?? '' },
    birthdate: birthdate.length === 8
      ? `${birthdate.slice(0, 4)}-${birthdate.slice(4, 6)}-${birthdate.slice(6, 8)}`
      : birthdate,
    gender,
  };
}

export function formatHL7DateTime(isoDate: string): string {
  return isoDate.replace(/[-:T]/g, '').slice(0, 14);
}

export function parseHL7DateTime(hl7Date: string): string {
  if (hl7Date.length < 8) return hl7Date;
  const year = hl7Date.slice(0, 4);
  const month = hl7Date.slice(4, 6);
  const day = hl7Date.slice(6, 8);
  const hour = hl7Date.slice(8, 10) || '00';
  const min = hl7Date.slice(10, 12) || '00';
  const sec = hl7Date.slice(12, 14) || '00';
  return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
}

export function validateHL7MessageStructure(segments: HL7Segment[]): void {
  if (segments.length === 0) {
    throw validation('HL7 message contains no segments');
  }
  if (segments[0].id !== 'MSH') {
    throw validation(`HL7 message must start with MSH segment, got: ${segments[0].id}`);
  }
  const msh = segments[0];
  if (!msh.fields[9]) {
    throw validation('HL7 MSH segment is missing message type (field 9)');
  }
  if (!msh.fields[10]) {
    throw validation('HL7 MSH segment is missing message control ID (field 10)');
  }
}

export function generateMessageControlId(prefix: string, timestamp: string): string {
  const tsCompact = timestamp.replace(/[^0-9]/g, '').slice(0, 14);
  return `${prefix}${tsCompact}`;
}
