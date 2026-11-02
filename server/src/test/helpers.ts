import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';

export const H = { 'X-Requested-With': 'dhaaga' };
/** A real 400×400 JPEG (the minimum product photo size). */
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAGQAZADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDNoooryT3QooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiioLq5+z7fk3bs98U0r6ITaSuyeiqH9pf9Mf/AB7/AOtR/aX/AEx/8e/+tVckiPaw7l+iqH9pf9Mf/Hv/AK1H9pf9Mf8Ax7/61HJIPaw7l+iqH9pf9Mf/AB7/AOtR/aX/AEx/8e/+tRySD2sO5foqh/aX/TH/AMe/+tR/aX/TH/x7/wCtRySD2sO5foqh/aX/AEx/8e/+tR/aX/TH/wAe/wDrUckg9rDuX6Kof2l/0x/8e/8ArUf2l/0x/wDHv/rUckg9rDuX6Kof2l/0x/8AHv8A61H9pf8ATH/x7/61HJIPaw7l+iqH9pf9Mf8Ax7/61H9pf9Mf/Hv/AK1HJIPaw7l+iqH9pf8ATH/x7/61H9pf9Mf/AB7/AOtRySD2sO5foqh/aX/TH/x7/wCtR/aX/TH/AMe/+tRySD2sO5foqh/aX/TH/wAe/wDrUf2l/wBMf/Hv/rUckg9rDuX6Kof2l/0x/wDHv/rUf2l/0x/8e/8ArUckg9rDuX6Kof2l/wBMf/Hv/rUf2l/0x/8AHv8A61HJIPaw7l+iqH9pf9Mf/Hv/AK1H9pf9Mf8Ax7/61HJIPaw7l+iqH9pf9Mf/AB7/AOtR/aX/AEx/8e/+tRySD2sO5foqh/aX/TH/AMe/+tR/aX/TH/x7/wCtRySD2sO5foqh/aX/AEx/8e/+tR/aX/TH/wAe/wDrUckg9rDuX6KrW1358hTy9uBnOc1ZqWmtyk01dBRRRSKCiiigAooooAKKKKACiiigAooooAKoap/yy/H+lX6oap/yy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/j4b/cP8xWnWZpv/Hw3+4f5itOuep8R1UvhCiiioNQooooAKKKKACiiigAooooAKKKKACqGqf8svx/pV+qGqf8svx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/4+G/3D/MVp1mab/x8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/ACy/H+lX6oap/wAsvx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/4+G/3D/MVp1mab/wAfDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKoap/yy/H+lX6oap/yy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/AI+G/wBw/wAxWnWZpv8Ax8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/LL8f6Vfqhqn/LL8f6VcPiM6vwMoUUUV0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFvTf+Phv9w/zFadZmm/8fDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKoap/yy/H+lX6oap/yy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/j4b/cP8xWnWZpv/Hw3+4f5itOuep8R1UvhCiiioNQooooAKKKKACiiigAooooAKKKKACqGqf8ALL8f6Vfqhqn/ACy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/j4b/cP8xWnWZpv/AB8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/LL8f6Vfqhqn/LL8f6VcPiM6vwMoUUUV0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFvTf8Aj4b/AHD/ADFadZmm/wDHw3+4f5itOuep8R1UvhCiiioNQooooAKKKKACiiigAooooAKKKKACqGqf8svx/pV+qGqf8svx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/4+G/3D/MVp1mab/x8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/LL8f6Vfqhqn/LL8f6VcPiM6vwMoUUUV0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFvTf+Phv9w/zFadZmm/8fDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKoap/wAsvx/pV+qGqf8ALL8f6VcPiM6vwMoUUUV0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFvTf+Phv9w/zFadZmm/8AHw3+4f5itOuep8R1UvhCiiioNQooooAKKKKACiiigAooooAKKKKACqGqf8svx/pV+qGqf8svx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/wCPhv8AcP8AMVp1mab/AMfDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKoap/yy/H+lX6oap/yy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/j4b/cP8xWnWZpv/Hw3+4f5itOuep8R1UvhCiiioNQooooAKKKKACiiigAooooAKKKKACqGqf8svx/pV+qGqf8svx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/4+G/3D/MVp1mab/x8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/ACy/H+lX6oap/wAsvx/pVw+Izq/AyhRRRXQcgUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAW9N/4+G/3D/MVp1mab/wAfDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKoap/yy/H+lX6oap/yy/H+lXD4jOr8DKFFFFdByBRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQBb03/AI+G/wBw/wAxWnWZpv8Ax8N/uH+YrTrnqfEdVL4QoooqDUKKKKACiiigAooooAKKKKACiiigAqhqn/LL8f6Vfqhqn/LL8f6VcPiM6vwMoUUUV0HIFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFABRRRQAUUUUAFFFFAFvTf+Phv9w/zFadZmm/8fDf7h/mK0656nxHVS+EKKKKg1CiiigAooooAKKKKACiiigAooooAKrXlu8+zYVG3Oc1Zopp2dyWk1ZmZ/Z8396P8z/hR/Z8396P8z/hWnRVe0ZHsomZ/Z8396P8z/hR/Z8396P8z/hWnRR7Rh7KJmf2fN/ej/M/4Uf2fN/ej/M/4Vp0Ue0YeyiZn9nzf3o/zP8AhR/Z8396P8z/AIVp0Ue0YeyiZn9nzf3o/wAz/hR/Z8396P8AM/4Vp0Ue0YeyiZn9nzf3o/zP+FH9nzf3o/zP+FadFHtGHsomZ/Z8396P8z/hR/Z8396P8z/hWnRR7Rh7KJmf2fN/ej/M/wCFH9nzf3o/zP8AhWnRR7Rh7KJmf2fN/ej/ADP+FH9nzf3o/wAz/hWnRR7Rh7KJmf2fN/ej/M/4Uf2fN/ej/M/4Vp0Ue0YeyiZn9nzf3o/zP+FH9nzf3o/zP+FadFHtGHsomZ/Z8396P8z/AIUf2fN/ej/M/wCFadFHtGHsomZ/Z8396P8AM/4Uf2fN/ej/ADP+FadFHtGHsomZ/Z8396P8z/hR/Z8396P8z/hWnRR7Rh7KJmf2fN/ej/M/4Uf2fN/ej/M/4Vp0Ue0YeyiZn9nzf3o/zP8AhR/Z8396P8z/AIVp0Ue0YeyiZn9nzf3o/wAz/hR/Z8396P8AM/4Vp0Ue0YeyiU7S1kglLOVIK44NXKKKlu+rLjFRVkFFFFIoKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==',
  'base64',
);
/** Has a JPEG signature but no image data — must be rejected. */
export const FAKE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
export const PDF = Buffer.from('%PDF-1.4\n% test document\n');
export type Agent = ReturnType<typeof request.agent>;

let seq = 0;
export const uid = (p: string) => `${p}-${Date.now()}-${++seq}`;

export async function registerRetailer(app: Express, agent: Agent) {
  const r = await agent.post('/api/auth/register').set(H).send({
    fullName: 'Test Retailer', phone: '9876543210', password: 'secret123', city: 'Bengaluru', acceptTerms: true, addressLine: '1 Market Road', state: 'Karnataka', pincode: '560002', confirmPassword: 'secret123', 
    email: `${uid('r')}@retailer.test`, businessName: 'Test Boutique', businessType: 'RETAILER',
  });
  expect(r.status).toBe(201);
  return r.body.user;
}

/** Registers a supplier, completes onboarding and gets admin approval. Returns the supplier id. */
export async function approvedSupplier(agent: Agent, admin: Agent, opts: { minOrderValue?: number } = {}) {
  const r = await agent.post('/api/auth/register').set(H).send({
    fullName: 'Owner', phone: '9876543210', password: 'secret123', city: 'Bengaluru', acceptTerms: true, addressLine: '1 Market Road', state: 'Karnataka', pincode: '560002', confirmPassword: 'secret123', categoryPaths: ['womens-wear/sarees'], description: 'We manufacture and supply wholesale garments.', 
    email: `${uid('s')}@supplier.test`, businessName: uid('Supplier'), businessType: 'WHOLESALER',
  });
  expect(r.status).toBe(201);
  const profile = await agent.put('/api/supplier/profile').set(H).send({
    businessName: r.body.user.supplier.businessName, businessType: 'WHOLESALER', contactName: 'Owner', phone: '9876543210',
    addressLine: '1 Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560002', categoryPaths: ['accessories/belts'], minOrderValue: opts.minOrderValue,
  });
  expect(profile.status).toBe(200);
  expect((await agent.post('/api/supplier/documents').set(H).field('type', 'GST_CERTIFICATE').attach('file', PDF, 'gst.pdf')).status).toBe(201);
  const id = r.body.user.supplier.id as string;
  expect((await admin.post(`/api/admin/suppliers/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
  return id;
}

/** Creates, photographs, submits and publishes a listing. Returns product id. */
export async function publishedProduct(agent: Agent, admin: Agent, body: Record<string, unknown>) {
  const r = await agent.post('/api/supplier/products').set(H).send({
    title: 'Test Listing Product', description: 'A test listing used by the automated test-suite.', categoryPath: 'accessories/belts',
    price: 100, priceUnit: 'PIECE', moq: 1, ...body,
  });
  expect(r.status).toBe(201);
  const id = r.body.product.id as string;
  expect((await agent.post(`/api/supplier/products/${id}/images`).set(H).field('usageRights', 'SUPPLIER_OWNED').attach('images', JPEG, 'p.jpg')).status).toBe(201);
  expect((await agent.post(`/api/supplier/products/${id}/submit`).set(H)).status).toBe(200);
  expect((await admin.post(`/api/admin/products/${id}/decision`).set(H).send({ decision: 'APPROVED' })).status).toBe(200);
  return id;
}

export async function addAddress(agent: Agent) {
  const a = await agent.post('/api/retailer/addresses').set(H).send({
    label: 'Shop', contactName: 'Buyer', phone: '9876543210', line1: '1 Street', city: 'Bengaluru', state: 'Karnataka', pincode: '560001',
  });
  expect(a.status).toBe(201);
  return a.body.address.id as string;
}
