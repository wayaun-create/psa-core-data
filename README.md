# PSA Core Data Chat

This project is a Vercel-ready Next.js chat app that:

- reads data from a Render PostgreSQL database
- sends that data as grounded context to your OpenAI Assistant
- returns an interpreted answer in a web chat UI

## 1. Requirements

- Node.js 18+
- Render PostgreSQL `DATABASE_URL`
- OpenAI API key
- OpenAI Assistant ID

## 2. Environment Variables

Copy `.env.example` to `.env.local` and fill values:

```bash
cp .env.example .env.local
```

Set:

- `DATABASE_URL`: your Render external connection string
- `DATA_ROW_LIMIT` (optional): rows read per table, default `50`, max `200`
- `OPENAI_API_KEY`: your OpenAI API key
- `OPENAI_ASSISTANT_ID`: your assistant id (format usually starts with `asst_`)

This app automatically reads from these tables:

- `accounts`
- `clients`
- `tax_sales`
- `parcels`

## 3. Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 4. Deploy To Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Deploy.

## 5. Important Notes

- The server route always sends database rows plus the user question to your assistant.
- The app does not require a SQL env variable; it performs fixed read-only `SELECT` queries against the four schema tables.
- Do not expose secrets in the client. All database/OpenAI access stays server-side.
