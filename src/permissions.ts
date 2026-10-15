export const permissionGroups = {
  Catalog: {
    "products.read": "View products",
    "products.write": "Edit products and prices",
    "products.delete": "Delete products",
    "categories.manage": "Manage categories",
    "collections.manage": "Manage collections",
    "merchandising.manage": "Curate storefront",
    "inventory.manage": "Manage inventory",
  },
  Orders: {
    "orders.read": "View orders",
    "orders.write": "Update orders",
    "orders.cancel": "Cancel orders",
    "orders.archive": "Archive orders",
    "customers.read": "View customer details",
  },
  Content: {
    "content.write": "Edit pages",
    "branding.write": "Manage branding",
    "media.write": "Manage images",
    "translations.write": "Manage translations",
    "contacts.write": "Manage contacts and socials",
  },
  Business: {
    "delivery.manage": "Manage delivery",
    "notifications.manage": "Manage notification destinations",
    "settings.write": "Manage store settings",
  },
  Administration: {
    "audit.read": "View activity",
    "admins.read": "View admin accounts",
    "admins.create": "Create admin accounts",
    "admins.write": "Manage non-owner accounts",
    "security.manage": "Manage security policy",
  },
};
export const capabilities = Object.keys(permissionGroups).flatMap((g) =>
  Object.keys(permissionGroups[g as keyof typeof permissionGroups]),
);
export const operationalPermissions = capabilities.filter(
  (p) => !p.startsWith("admins.") && p !== "security.manage",
);
export function allowed(u: any, p: string) {
  return !!u && (!!u.is_main || JSON.parse(u.permissions).includes(p));
}
export function canManage(actor: any, target: any) {
  return (
    !target.is_main &&
    target.id !== actor.id &&
    (actor.is_main ||
      JSON.parse(target.permissions).every((p: string) =>
        JSON.parse(actor.permissions).includes(p),
      ))
  );
}
