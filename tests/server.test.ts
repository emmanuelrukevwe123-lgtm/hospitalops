import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { server } from '../src/server';

let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

interface Res {
  status: number;
  body: string;
  json: <T = any>() => T;
}

function request(method: string, pathName: string, payload?: unknown): Promise<Res> {
  return new Promise((resolve, reject) => {
    const data = payload === undefined ? undefined : JSON.stringify(payload);
    const req = http.request(
      `${baseUrl}${pathName}`,
      {
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            json: () => JSON.parse(body),
          }),
        );
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('HTTP server — static and read endpoints', () => {
  it('serves the dashboard index for non-API GET requests', async () => {
    const res = await request('GET', '/');
    expect(res.status).toBe(200);
    expect(res.body.toLowerCase()).toContain('<!doctype html');
  });

  it('falls back to index.html for unknown static paths', async () => {
    const res = await request('GET', '/some/spa/route');
    expect(res.status).toBe(200);
  });

  it('lists seeded patients (initially empty array)', async () => {
    const res = await request('GET', '/api/patients');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('lists seeded beds', async () => {
    const res = await request('GET', '/api/beds');
    expect(res.status).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
  });

  it('lists seeded pharmacy stock', async () => {
    const res = await request('GET', '/api/pharmacy');
    expect(res.json().some((m: any) => m.itemName === 'Nitroglycerin')).toBe(true);
  });

  it('lists seeded staff', async () => {
    const res = await request('GET', '/api/staff');
    expect(res.json().length).toBeGreaterThan(0);
  });

  it('returns analytics KPIs', async () => {
    const res = await request('GET', '/api/analytics');
    const body = res.json();
    expect(body).toHaveProperty('occupancy');
    expect(body).toHaveProperty('sla');
    expect(body).toHaveProperty('totalBeds');
  });

  it('returns an audit trail array', async () => {
    const res = await request('GET', '/api/audit');
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('returns 404 for an unknown API route', async () => {
    const res = await request('GET', '/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.json().error).toBe('Not Found');
  });
});

describe('HTTP server — patient lifecycle flow', () => {
  it('rejects registration with missing fields', async () => {
    const res = await request('POST', '/api/patients/register', { name: 'No DOB' });
    expect(res.status).toBe(400);
    expect(res.json().error).toMatch(/Missing/);
  });

  it('registers, triages and admits a patient end to end', async () => {
    const reg = await request('POST', '/api/patients/register', {
      name: 'Test Patient',
      birthdate: '1960-01-01',
      presentingComplaint: 'Chest pain',
      comorbidities: 'Hypertension, Diabetes',
    });
    expect(reg.status).toBe(201);
    const patientId = reg.json().id;
    expect(patientId).toBeTruthy();

    const triage = await request('POST', '/api/patients/triage', {
      patientId,
      triageLevel: 'Immediate',
    });
    expect(triage.status).toBe(200);
    expect(triage.json().state).toBe('Triaged');
    expect(triage.json().priorityScore).toBeGreaterThan(0);

    const beds = (await request('GET', '/api/beds')).json();
    const generalBed = beds.find((b: any) => b.type === 'General');
    const admit = await request('POST', '/api/patients/admit', {
      patientId,
      bedId: generalBed.id,
    });
    expect(admit.status).toBe(200);
    expect(admit.json().state).toBe('Admitted');
    expect(admit.json().assignedBedId).toBe(generalBed.id);
  });

  it('rejects triage for a non-existent patient', async () => {
    const res = await request('POST', '/api/patients/triage', { patientId: 'nope', triageLevel: 'Standard' });
    expect(res.status).toBe(400);
  });

  it('rejects admit with missing bed id', async () => {
    const res = await request('POST', '/api/patients/admit', { patientId: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('HTTP server — pharmacy dispensing', () => {
  it('rejects dispense with missing identifiers', async () => {
    const res = await request('POST', '/api/pharmacy/dispense', { medId: 'm1' });
    expect(res.status).toBe(400);
  });

  it('dispenses a non-high-alert drug for a registered patient', async () => {
    const reg = await request('POST', '/api/patients/register', {
      name: 'Pharmacy Patient',
      birthdate: '1980-06-06',
    });
    const patientId = reg.json().id;

    const meds = (await request('GET', '/api/pharmacy')).json();
    const ibuprofen = meds.find((m: any) => m.itemName === 'Ibuprofen');
    const res = await request('POST', '/api/pharmacy/dispense', {
      medId: ibuprofen.id,
      patientId,
    });
    expect(res.status).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().medication.quantity).toBe(ibuprofen.quantity - 1);
  });

  it('blocks a high-alert drug without a second verifier', async () => {
    const reg = await request('POST', '/api/patients/register', {
      name: 'High Alert Patient',
      birthdate: '1975-03-03',
    });
    const patientId = reg.json().id;
    const meds = (await request('GET', '/api/pharmacy')).json();
    const nitro = meds.find((m: any) => m.itemName === 'Nitroglycerin');
    const res = await request('POST', '/api/pharmacy/dispense', {
      medId: nitro.id,
      patientId,
    });
    expect(res.status).toBe(400);
  });
});
