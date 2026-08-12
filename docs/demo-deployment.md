# Demo deployment safety

This repository is for `varunnagda950612/sales-order-demo` only. It must never be linked to the production Supabase or Vercel projects and must never contain exported production records.

## Supabase

1. Create a new Supabase project named `sales-order-demo` in the intended personal organization.
2. Link only after checking the displayed project name and reference.
3. Apply migrations with `npx supabase@latest db push` only after the CLI reports the demo project reference.
4. Configure the seed environment variables locally; do not commit them.
5. Run `npm run seed:demo`. The script refuses to run unless the URL and explicit demo project reference match and the synthetic-data confirmation is present.

Required seed variables:

```text
SUPABASE_URL=https://<demo-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<demo-service-role-key>
NEXT_PUBLIC_APP_VARIANT=demo
NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF=<demo-project-ref>
DEMO_SEED_CONFIRMATION=I_UNDERSTAND_THIS_IS_SYNTHETIC_DEMO_DATA
DEMO_USER_PASSWORD=<demo-only-password>
```

## Vercel

Create a separate project named `sales-order-demo` from `varunnagda950612/sales-order-demo`. Configure the values from `.env.example` for Production, Preview, and Development. Confirm that `NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF` exactly matches the demo Supabase URL before deploying.

The application fails closed when a non-local Supabase URL does not match the explicit demo project reference.
