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
```

## Deployment

The simplest deployment path is Vercel:

1. Push this folder to GitHub
2. Import the repo into Vercel
3. Add the Firebase environment variables in the Vercel dashboard
4. Deploy

After deployment, both users can access the same shared app from desktop or mobile.

Do not commit real secrets or service-account JSON files into the repo.
