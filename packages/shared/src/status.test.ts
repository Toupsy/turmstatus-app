import { describe, it, expect } from 'vitest';
import { deriveTowerStatus, boatStaffDelta, effectiveRequiredStaff, summarizeBoats } from './status.js';

describe('deriveTowerStatus', () => {
  it('voll besetzt → GREEN', () => {
    expect(deriveTowerStatus(2, 2)).toBe('GREEN');
    expect(deriveTowerStatus(3, 2)).toBe('GREEN');
  });
  it('halb besetzt → YELLOW', () => {
    expect(deriveTowerStatus(1, 2)).toBe('YELLOW');
    expect(deriveTowerStatus(2, 4)).toBe('YELLOW');
  });
  it('unterbesetzt → RED', () => {
    expect(deriveTowerStatus(0, 2)).toBe('RED');
    expect(deriveTowerStatus(1, 4)).toBe('RED');
  });
  it('Sollstärke 0 wird als 1 behandelt', () => {
    expect(deriveTowerStatus(0, 0)).toBe('RED');
    expect(deriveTowerStatus(1, 0)).toBe('GREEN');
  });
});

describe('boatStaffDelta', () => {
  it('Boots-Status → Beitrag zur Sollstärke', () => {
    expect(boatStaffDelta('AT_TOWER')).toBe(1);
    expect(boatStaffDelta('PATROL')).toBe(-1);
    expect(boatStaffDelta('DEPLOYED')).toBe(-1);
    expect(boatStaffDelta('OUT_OF_SERVICE')).toBe(0);
    expect(boatStaffDelta(undefined)).toBe(0);
  });
});

describe('effectiveRequiredStaff', () => {
  it('Standard-Turm ohne Boot → Basis (2)', () => {
    expect(effectiveRequiredStaff(2, [])).toBe(2);
    expect(effectiveRequiredStaff(undefined, [])).toBe(2);
  });
  it('Boot am Turm → 2 WF + 1 BF = 3', () => {
    expect(effectiveRequiredStaff(2, ['AT_TOWER'])).toBe(3);
  });
  it('Boot außer Dienst → wie normaler Turm (2)', () => {
    expect(effectiveRequiredStaff(2, ['OUT_OF_SERVICE'])).toBe(2);
  });
  it('Boot auf Streife/Einsatz → 1 (Boot weg)', () => {
    expect(effectiveRequiredStaff(2, ['PATROL'])).toBe(1);
    expect(effectiveRequiredStaff(2, ['DEPLOYED'])).toBe(1);
  });
  it('nie unter 1', () => {
    expect(effectiveRequiredStaff(1, ['PATROL'])).toBe(1);
    expect(effectiveRequiredStaff(2, ['PATROL', 'DEPLOYED', 'PATROL'])).toBe(1);
  });
});

describe('summarizeBoats', () => {
  it('Lage zusammenfassen + Warnung bei Boot unterwegs', () => {
    expect(summarizeBoats([])).toEqual({ hasBoat: false, atTower: 0, away: 0, broken: 0, warning: false });
    expect(summarizeBoats(['AT_TOWER'])).toEqual({ hasBoat: true, atTower: 1, away: 0, broken: 0, warning: false });
    expect(summarizeBoats(['PATROL'])).toEqual({ hasBoat: true, atTower: 0, away: 1, broken: 0, warning: true });
    expect(summarizeBoats(['OUT_OF_SERVICE'])).toEqual({ hasBoat: true, atTower: 0, away: 0, broken: 1, warning: false });
  });
});
