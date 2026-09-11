import { describe, expect, it } from 'vitest';
import { hasRole, ROLE_RANK } from '../../src/utils/roles';

describe('hasRole', () => {
  it('ranks user < manager < admin < super_admin', () => {
    expect(ROLE_RANK.user).toBeLessThan(ROLE_RANK.manager);
    expect(ROLE_RANK.manager).toBeLessThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeLessThan(ROLE_RANK.super_admin);
  });

  it('lets a manager pass a manager-or-higher gate but not an admin gate', () => {
    expect(hasRole('manager', 'manager')).toBe(true);
    expect(hasRole('manager', 'admin')).toBe(false);
  });

  it('lets every higher role pass a lower gate', () => {
    expect(hasRole('admin', 'manager')).toBe(true);
    expect(hasRole('super_admin', 'admin')).toBe(true);
  });

  it('treats an unrecognized role as having no privilege', () => {
    expect(hasRole('bogus', 'user')).toBe(false);
  });
});
