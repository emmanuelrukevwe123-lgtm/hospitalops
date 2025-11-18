import { describe, it, expect } from 'vitest';
import {
  OrderStatus,
  validateOrderStatusTransition,
  verifyAllergies,
  generateProtocolOrders,
  OrderType,
} from '../src/clinical/order';

describe('Order Management Module', () => {
  describe('validateOrderStatusTransition', () => {
    it('allows valid transitions', () => {
      expect(() => validateOrderStatusTransition(OrderStatus.Draft, OrderStatus.Submitted)).not.toThrow();
      expect(() => validateOrderStatusTransition(OrderStatus.Submitted, OrderStatus.Acknowledged)).not.toThrow();
    });

    it('throws error for invalid transitions', () => {
      expect(() => validateOrderStatusTransition(OrderStatus.Draft, OrderStatus.Acknowledged)).toThrow();
      expect(() => validateOrderStatusTransition(OrderStatus.Completed, OrderStatus.Draft)).toThrow();
    });
  });

  describe('verifyAllergies', () => {
    it('succeeds if patient has no matching allergies', () => {
      expect(() => verifyAllergies(['Sulfa'], 'Penicillin')).not.toThrow();
    });

    it('throws error if patient has matching allergy and no override is provided', () => {
      expect(() => verifyAllergies(['Penicillin'], 'Penicillin')).toThrow(/Allergy alert/);
    });

    it('succeeds if patient has allergy but override reason is supplied', () => {
      expect(() =>
        verifyAllergies(['Penicillin'], 'Penicillin', 'Benefits outweigh risks, monitored close'),
      ).not.toThrow();
    });
  });

  describe('generateProtocolOrders', () => {
    it('generates correct orders for Sepsis protocol', () => {
      const orders = generateProtocolOrders('pat_0001', 'staff_0001', 'Sepsis');
      expect(orders).toHaveLength(4);
      expect(orders[0].details.itemName).toBe('Blood Culture x2');
      expect(orders[0].orderType).toBe(OrderType.Lab);
      expect(orders[0].status).toBe(OrderStatus.Submitted);
    });

    it('throws error for unknown protocol', () => {
      expect(() => generateProtocolOrders('pat_0001', 'staff_0001', 'Invalid' as any)).toThrow(
        /Unknown protocol/,
      );
    });
  });
});
