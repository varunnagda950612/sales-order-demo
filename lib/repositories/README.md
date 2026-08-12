# Supabase Read Mappers

This folder contains read-only Supabase mappers used by server page loaders.

Writes for orders, visit proofs, and collections go through the protected sync
functions in `lib/sync`, not through repository adapters. Local mode continues
to use the direct helpers in `lib/local`.
