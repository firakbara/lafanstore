import { describe, expect, test } from 'bun:test';
import { deleteAdminGuard } from './auth';

describe('deleteAdminGuard', () => {
	test('refuses to delete your own account', () => {
		expect(deleteAdminGuard(1, 1, 3)).toBe('You cannot delete your own account');
	});
	test('refuses to delete the last account', () => {
		expect(deleteAdminGuard(1, 2, 1)).toBe('The last admin account cannot be deleted');
	});
	test('allows deleting another account when more remain', () => {
		expect(deleteAdminGuard(1, 2, 2)).toBeNull();
	});
});
