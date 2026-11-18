# De Vera's Art Portfolio System

## Upload to GitHub

1. Create a GitHub repository.
2. Choose **Add file → Upload files** and upload the files inside this folder, not the ZIP itself.
3. Commit the upload to the repository.
4. Confirm `index.html` and `vercel.json` are in the repository root.

## Deploy on Vercel

Import the GitHub repository as a new Vercel project. Set the Root Directory to the folder containing `index.html`, use the **Other** framework preset, and leave the build command empty. Redeploy after changing these settings.

## Important limitations

- This is a browser-only demo. Accounts, artwork, and approvals are stored in each visitor's browser and are not shared across devices.
- The seeded admin password is intentionally unset in this upload-safe copy. Do not put an admin password in client-side code.
- A secure admin login and shared data require a server backend and a database; neither is included in this static package.
- Do not use this demo for real authentication or private data.
