# De Vera's Art Portfolio System

This static site uses Supabase for authentication, shared artist profiles, artwork submissions, admin review, and image storage. The database and storage policies are defined in `supabase/schema.sql`.

## 1. Create and configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the Project URL and the publishable (or legacy `anon`) key. These browser values are public; never use a `service_role` or secret key in this site.
4. Put the URL and publishable/anon key into `supabase-config.js`, replacing both `YOUR_...` placeholders.
5. In **Authentication → URL Configuration**, set the Site URL to your Vercel domain. Add your Vercel preview/deployment URLs to the redirect URL allowlist if you use email confirmation.

The SQL creates public artist profiles, private pending submissions, row-level security policies, and a public image bucket. Image URLs are publicly viewable; do not upload private images.

## 2. Create the administrator

1. Deploy the site and create an account using `kienvalantindevera@gmail.com` and a password you choose.
2. In the Supabase SQL Editor, run:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id from auth.users
     where lower(email) = lower('kienvalantindevera@gmail.com')
   );
   ```

3. Sign out and sign back in. The account will then have access to **Review posts**.

The admin password is managed by Supabase Authentication and is not embedded in this repository. Do not add a service key or password to client-side code.

## 3. Upload to GitHub

Upload the contents of this folder—not the ZIP itself—to the root of a GitHub repository. The root must contain `index.html`, `app.js`, `supabase-config.js`, and `vercel.json`.

## 4. Deploy on Vercel

Import the GitHub repository into Vercel. Set the Root Directory to the folder containing `index.html`, choose the **Other** framework preset, and leave the build command empty. Deploy or redeploy after configuring `supabase-config.js`.

## Notes

- Accounts created before connecting this Supabase project are stored only in their original browser and are not automatically imported. Create accounts again on the deployed site.
- If Supabase email confirmation is enabled, new members must confirm their email before they can sign in.
- Supabase free-tier service limits may apply. This project has no server-side service key; authorization is enforced by database row-level security.
