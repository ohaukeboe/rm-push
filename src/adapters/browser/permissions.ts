import type { Permissions } from "../ports";

export const browserPermissions: Permissions = {
	contains(origins: string[]): Promise<boolean> {
		return browser.permissions.contains({ origins });
	},
};
