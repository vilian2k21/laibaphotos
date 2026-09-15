# Our Little Universe

Private photo and video gallery for Himel & Laiba, built as a single React/Vite/Express service.

## What is included

- All 97 supported originals from the provided archive: 60 images and 37 videos.
- Generated 720px image previews and video poster frames in `public/thumbs` and `public/posters`.
- Home experience, date-grouped gallery, filename search, type filters, sorting, favorites, fullscreen photo/video viewer, keyboard navigation, and mobile layouts.
- Developer-only media integrity view at **Integrity** in the navigation. It reports the archive count, import counts, file sizes, duplicate hash groups, and preview health.
- Protected original-media route. In production, set `PRIVATE_ACCESS_CODE` to enable the unlock cookie flow. Keep `SESSION_SECRET` private.
- Railway-friendly `PORT` handling and a unified production server.

## Run locally

```bash
npm install
npm run dev
```

Open the Replit preview or `http://localhost:5000`.

## Production

```bash
npm run build
NODE_ENV=production npm start
```

Set `SESSION_SECRET`, `PRIVATE_ACCESS_CODE`, and `PORT` in Railway. For a production deployment with a larger or changing library, move the originals and previews to private S3-compatible storage and replace the filesystem catalog with PostgreSQL metadata; this build keeps the imported archive local so the supplied memories remain available in the project.