This is a shared expense tracker built with [Next.js](https://nextjs.org) and Firebase Firestore.

## Getting Started

1. Create a local env file from `.env.example`.
2. Fill in the Firebase web config values.
3. Run the development server:

```bash
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Edit [`app/page.tsx`](./app/page.tsx) to update the app.

## Firebase Environment Variables

Add these values to `.env.local` for local development and to Vercel environment variables for deployment:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_ALLOWED_EMAILS=
```

`NEXT_PUBLIC_ALLOWED_EMAILS` should be a comma-separated list of the Google email addresses that are allowed to use the app.

Example:

```bash
NEXT_PUBLIC_ALLOWED_EMAILS=you@example.com,tejal@example.com
```

## Deployment

The simplest deployment path is Vercel:

1. Push this folder to GitHub
2. Import the repo into Vercel
3. Add the Firebase environment variables in the Vercel dashboard
4. Deploy

After deployment, both users can access the same shared app from desktop or mobile.

For Google sign-in to work:

1. In the Firebase console, enable Google as a sign-in provider.
2. In Firebase Authentication settings, make sure your Vercel domain is listed as an authorized domain.
3. Update `NEXT_PUBLIC_ALLOWED_EMAILS` in Vercel with the exact email addresses you want to allow.

Do not commit real secrets or service-account JSON files into the repo.
