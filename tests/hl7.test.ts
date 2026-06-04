import { describe, it, expect } from 'vitest';
import {
  buildMSH,
  buildPID,
  buildPV1,
  buildADTMessage,
  buildORUMessage,
  parseHL7Message,
  extractPIDFromSegments,
  formatHL7DateTime,
  parseHL7DateTime,
  validateHL7MessageStructure,
  generateMessageControlId,
  HL7MessageType,
} from '../src/integration/hl7';
import { AppError } from '../src/core/errors';

describe('buildMSH', () => {
  it('builds MSH segment starting with MSH', () => {
    const msh = buildMSH('ADT^A01', 'MSG001', 'SenderApp', 'SenderFac', 'ReceiverApp', 'ReceiverFac', '20260101080000');
    expect(msh.startsWith('MSH')).toBe(true);
  });

  it('includes message type', () => {
    const msh = buildMSH('ADT^A01', 'MSG001', 'App', 'Fac', 'App2', 'Fac2', '20260101080000');
    expect(msh).toContain('ADT^A01');
  });

  it('includes message control ID', () => {
    const msh = buildMSH('ADT^A01', 'CTRL123', 'App', 'Fac', 'App2', 'Fac2', '20260101080000');
    expect(msh).toContain('CTRL123');
  });
});

describe('buildPID', () => {
  it('builds PID segment', () => {
    const pid = buildPID('pat_001', 'Doe', 'John', '19551112', 'M');
    expect(pid.startsWith('PID')).toBe(true);
    expect(pid).toContain('pat_001');
    expect(pid).toContain('Doe^John');
  });

  it('converts birthdate format removing hyphens', () => {
    const pid = buildPID('p1', 'Smith', 'Jane', '1975-03-20', 'F');
    expect(pid).toContain('19750320');
  });
});

describe('buildPV1', () => {
  it('builds PV1 segment', () => {
    const pv1 = buildPV1('I', '2026-01-01T08:00:00Z', 'ward_icu', 'bed_001', 'dr_001');
    expect(pv1.startsWith('PV1')).toBe(true);
  });

  it('includes ward and bed in location field', () => {
    const pv1 = buildPV1('I', undefined, 'ward_icu', 'bed_001');
    expect(pv1).toContain('ward_icu');
    expect(pv1).toContain('bed_001');
  });
});

describe('buildADTMessage', () => {
  it('produces multi-segment ADT message', () => {
    const msg = buildADTMessage(
      HL7MessageType.ADT_A01,
      'pat_001',
      { family: 'Doe', given: 'John' },
      '1955-11-12',
      'M',
      { messageControlId: 'MSG001', dateTime: '20260101080000', admitDateTime: '2026-01-01T08:00:00Z' },
    );
    expect(msg).toContain('MSH');
    expect(msg).toContain('PID');
    expect(msg).toContain('PV1');
  });

  it('contains patient ID in message', () => {
    const msg = buildADTMessage(
      HL7MessageType.ADT_A03,
      'pat_999',
      { family: 'Jones', given: 'Alice' },
      '1980-06-15',
      'F',
      { messageControlId: 'MSG002', dateTime: '20260104090000' },
    );
    expect(msg).toContain('pat_999');
  });
});

describe('buildORUMessage', () => {
  const observations = [
    {
      identifier: 'TropI',
      value: '0.08',
      units: 'μg/L',
      referenceRange: '<0.04',
      abnormalFlag: 'H' as const,
      observationStatus: 'F' as const,
      dateTime: '20260101090000',
    },
  ];

  it('produces multi-segment ORU message', () => {
    const msg = buildORUMessage('pat_001', 'ord_001', 'TROPI', 'Troponin-I', observations, 'MSG003', '20260101090000');
    expect(msg).toContain('MSH');
    expect(msg).toContain('PID');
    expect(msg).toContain('OBR');
    expect(msg).toContain('OBX');
  });

  it('includes observation value', () => {
    const msg = buildORUMessage('pat_001', 'ord_001', 'TROPI', 'Troponin-I', observations, 'MSG003', '20260101090000');
    expect(msg).toContain('0.08');
  });
});

describe('parseHL7Message', () => {
  it('parses segments from ADT message', () => {
    const msg = 'MSH|^~\\&|App|Fac|App2|Fac2|20260101|Security|ADT^A01|MSG001|P|2.5\rPID|1||pat_001||Doe^John||19551112|M\rPV1|1|I';
    const segments = parseHL7Message(msg);
    expect(segments.length).toBe(3);
    expect(segments[0]!.id).toBe('MSH');
    expect(segments[1]!.id).toBe('PID');
    expect(segments[2]!.id).toBe('PV1');
  });

  it('handles CRLF line endings', () => {
    const msg = 'MSH|^~\\&|App|Fac|App2|Fac2|20260101||ADT^A01|MSG001|P|2.5\r\nPID|1||p1||Doe^John';
    const segments = parseHL7Message(msg);
    expect(segments.length).toBe(2);
  });
});

describe('extractPIDFromSegments', () => {
  it('extracts patient ID and name from PID', () => {
    const msg = 'MSH|^~\\&|App|Fac|App2|Fac2|20260101||ADT^A01|MSG001|P|2.5\rPID|1||pat_123||Smith^Jane||19800620|F';
    const segments = parseHL7Message(msg);
    const pid = extractPIDFromSegments(segments);
    expect(pid.patientId).toBe('pat_123');
    expect(pid.patientName.family).toBe('Smith');
    expect(pid.patientName.given).toBe('Jane');
    expect(pid.gender).toBe('F');
  });

  it('throws when no PID segment exists', () => {
    const segments = parseHL7Message('MSH|^~\\&|App|Fac|App2|Fac2|20260101||ADT^A01|MSG001|P|2.5');
    expect(() => extractPIDFromSegments(segments)).toThrow(AppError);
  });

  it('converts HL7 date to ISO format', () => {
    const msg = 'MSH|^~\\&|App|Fac|App2|Fac2|20260101||ADT^A01|MSG001|P|2.5\rPID|1||p1||Doe^John||19551112|M';
    const segments = parseHL7Message(msg);
    const pid = extractPIDFromSegments(segments);
    expect(pid.birthdate).toBe('1955-11-12');
  });
});

describe('formatHL7DateTime', () => {
  it('converts ISO to HL7 compact format', () => {
    expect(formatHL7DateTime('2026-06-04T08:30:00.000Z')).toBe('20260604083000');
  });
});

describe('parseHL7DateTime', () => {
  it('converts HL7 date to ISO format', () => {
    expect(parseHL7DateTime('20260604083000')).toBe('2026-06-04T08:30:00.000Z');
  });

  it('returns short strings unchanged', () => {
    expect(parseHL7DateTime('2026')).toBe('2026');
  });
});

describe('validateHL7MessageStructure', () => {
  it('passes for valid MSH-first message', () => {
    const segments = parseHL7Message('MSH|^~\\&|App|Fac|App2|Fac2|20260101||ADT^A01|MSG001|P|2.5');
    expect(() => validateHL7MessageStructure(segments)).not.toThrow();
  });

  it('throws for empty message', () => {
    expect(() => validateHL7MessageStructure([])).toThrow(AppError);
  });

  it('throws when first segment is not MSH', () => {
    const segments = parseHL7Message('PID|1||pat_001');
    expect(() => validateHL7MessageStructure(segments)).toThrow(AppError);
  });
});

describe('generateMessageControlId', () => {
  it('generates prefixed control ID', () => {
    const id = generateMessageControlId('ADT', '2026-06-04T08:30:00.000Z');
    expect(id.startsWith('ADT')).toBe(true);
    expect(id.length).toBeGreaterThan(3);
  });

  it('generates unique IDs for different timestamps', () => {
    const id1 = generateMessageControlId('MSG', '2026-01-01T08:00:00.000Z');
    const id2 = generateMessageControlId('MSG', '2026-01-01T09:00:00.000Z');
    expect(id1).not.toBe(id2);
  });
});
