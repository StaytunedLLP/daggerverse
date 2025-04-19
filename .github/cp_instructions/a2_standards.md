# Mandatory Prefix Naming Conventions

- **`fd_` (Field Domain):** Top-level business domain (e.g.,
  `fd_inventory_management/`).
- **`fe_` (Feature Slice):** Major functional area within a domain (e.g.,
  `fe_product_catalog/`).
- **`sy_` (Story):** Specific user journey/task within a feature (e.g.,
  `sy_add_new_product/`).
- **`bk_` (Block):** Modular code unit encapsulating specific functionality
  (e.g., `bk_data_access/`).

## Deno Workspaces & Imports

- Use Deno Workspaces defined in the root `deno.json`.
- **Mandatory:** Use direct, absolute workspace imports:
  `import { functionX } from "@repo/src/_shared/bk_utils/helpers.ts";` or
  `import { type User } from "@repo/src/fd_domain1.com/_shared/bk_data_access_entities/user.entity.ts";`.
- **Rule: NO `mod.ts`** - Do not use `mod.ts` for re-exporting symbols from
  within a block to simplify imports. Import directly from the source file.
  _Exception: A block's primary entry point if explicitly defined as such in its
  specific documentation._
