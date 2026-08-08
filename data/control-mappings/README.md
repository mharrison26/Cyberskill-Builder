# Control mappings dataset

Reference crosswalk used to seed `public.control_mappings`.

## Source

Derived from [accountmade/security-framework-crosswalk](https://github.com/accountmade/security-framework-crosswalk) (CC-BY-4.0): CSA CCM v4 controls mapped to NIST SP 800-53 Rev. 5, SOC 2 TSC, and ISO/IEC 27001:2022.

NIST↔SOC2, NIST↔ISO, and SOC2↔ISO pairs are produced by joining target framework IDs that share a common CCM control, taking the minimum per-edge confidence (`high` | `medium` | `low`).

## Files

| File | Purpose |
| --- | --- |
| `ccm-crosswalk.csv` | Upstream flat crosswalk snapshot |
| `control_mappings.csv` | Derived directed pairs matching the DB schema |
| `nist-soc2-iso-mappings.json` | Same pairs plus provenance metadata |
| `control_mappings_seed.sql` | VALUES fragment embedded in migration `0030_control_mappings.sql` |

Regenerate by re-running the join against an updated `ccm-crosswalk.csv` and refreshing the migration seed fragment.
