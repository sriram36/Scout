# Scout dashboard

Next.js dashboard for Scout: browse discovered jobs, queue applications, and watch their status update live.

Create `.env.local` in this folder:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_LOCAL_API=http://localhost:3001
```

Use the **anon** key only — never the service-role key, because everything prefixed `NEXT_PUBLIC_` is shipped to the browser.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build + type check
```

The dashboard reads `listings` and `applications` from Supabase, queues an application by setting its status to `pending_application`, and talks to the local apply server (`NEXT_PUBLIC_LOCAL_API`) for `/health` and `/profile`. See the [root README](../README.md) for the full setup.
