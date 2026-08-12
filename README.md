# Sales Order Demo

A standalone Next.js sales operations demo with role-based dashboards, shops and routes, GPS visit workflows, orders, collections, targets, reporting, offline recovery, and Supabase sync.

## Safety boundary

- GitHub repository: `varunnagda950612/sales-order-demo`
- Supabase: a separate project named `sales-order-demo`
- Vercel: a separate project named `sales-order-demo`
- Data: synthetic demo records only
- Production exports, credentials, project references, customer records, orders, collections, and GPS history are prohibited

The app fails closed in Supabase mode unless `NEXT_PUBLIC_APP_VARIANT=demo` and the project reference parsed from `NEXT_PUBLIC_SUPABASE_URL` exactly matches `NEXT_PUBLIC_DEMO_SUPABASE_PROJECT_REF`.

## Local development

```bash
npm install
copy .env.example .env.local
npm run dev
```

For a browser-only sandbox, set `NEXT_PUBLIC_APP_DATA_MODE=local` and `NEXT_PUBLIC_SUPABASE_WRITE_MODE=disabled`. Local logins are `admin`, `manager`, and `sales`; any password is accepted.

For the isolated Supabase demo, populate `.env.local` from `.env.example` with demo-project values only.

## Validation

```bash
npm test
npm run build
```

## Database and deployment

Review [docs/demo-deployment.md](docs/demo-deployment.md) before linking Supabase, applying migrations, seeding, or configuring Vercel.
