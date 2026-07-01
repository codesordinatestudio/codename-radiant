# Globals

A `global` block defines a singleton document — a single instance of a data model, useful for site-wide settings, configuration, or feature flags. Unlike collections (which have many records), globals have exactly one record.

## Syntax

```radiant
global <name> {
  fields: {
    // field definitions
  }
}
```

The name must be a valid identifier and unique across all `.radiant` files.

## Allowed Properties

Globals support the same allowed properties as collections:

| Property | Type | Description |
|---|---|---|
| `fields` | Object | Field definitions (same types as collections). |
| `auth` | Boolean | Not typically used on globals. |
| `cache` | Object | Caching settings. |
| `hooks` | Object | Lifecycle hooks. |
| `admin` | Object | Admin UI settings. |

## Example: Site Settings

```radiant
global siteSettings {
  fields: {
    siteName: text
    description: textarea
    maintenanceMode: boolean @default(false)
    maxUploadSize: integer @default(10485760)
    theme: select("light", "dark", "auto") @default("auto")
  }
}
```

## Generated Types

Globals produce the same TypeScript types as collections (model, create, update, where clause):

```typescript
export interface SiteSettings {
  id: string;
  siteName: string;
  description: string;
  maintenanceMode: boolean;
  maxUploadSize: number;
  theme: "light" | "dark" | "auto";
}

export interface SiteSettingsCreate {
  siteName: string;
  description: string;
  maintenanceMode?: boolean;
  maxUploadSize?: number;
  theme?: "light" | "dark" | "auto";
}

export type SiteSettingsUpdate = Partial<SiteSettingsCreate>;
```

Globals are also registered in the `Collections` type:

```typescript
export type Collections = {
  siteSettings: SiteSettings;
  // ...collections...
};
```

## Validation

Globals go through the same field validation as collections:

- Field types must be in the allowed set
- Relationship targets must exist
- `select` fields must have at least one option
- Duplicate global names produce an error

## Use Cases

- **Site settings** — site name, description, maintenance flags
- **Feature flags** — toggle features on/off globally
- **Theme configuration** — colors, logos, layout
- **Billing plans** — current plan, limits, renewal date
- **SEO metadata** — default title, description, social image

## Related

- [Collections](./collections) — Collections share the same field/decorator system
- [Field Types](./field-types) — All available field types
- [CLI Reference](./cli-reference) — How globals are represented in generated code