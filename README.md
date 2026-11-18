# De Vera's Art Portfolio

The site has a public artist and artwork gallery, user accounts, and an admin dashboard. Users can edit their own public artist profile and upload, edit, or remove their artwork. New artworks appear in the public gallery immediately. Admins can manage gallery entries and user/admin roles. Account deletion and password resets are handled in Supabase.

## 1. Set up Supabase

1. In Supabase, open **Project Settings → API**.
2. Confirm `supabase-config.js` has your **Project URL** and browser-safe **publishable/anon key**. Use the base project URL (for example, `https://your-project.supabase.co`), not a URL ending in `/rest/v1`. Never put a `service_role` key or password in the website.
3. Open Supabase **SQL Editor**, paste the entire `supabase/setup.sql` file, and click **Run**. This creates the profile tables, the `devera-portfolio-images` storage bucket, and their access rules. The portfolio-specific table names avoid conflicts with older tables named `artists` or `artworks`. It also creates public artist profiles for existing accounts. If you already set up Supabase earlier, run this updated SQL again.
4. In **Authentication → Sign In / Providers**, enable email/password sign-in. Choose whether users must confirm their email.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed site. Add the local and preview origins you use to the redirect URL allowlist.

Keep `default-profile.jfif` beside `index.html`; new accounts use it as their default profile picture.

## 2. Create user accounts

1. Open the website and click **User login**.
2. Choose **Create a user account**, enter a name, email, and password.
3. If email confirmation is enabled, confirm the account using the email Supabase sends.
4. Sign in with **User login**.

There is no pre-created account or default password.

After signing in, use **Your profile and artwork** to set your public name, specialty, bio, and profile photo. The artist profile appears on the main gallery. Your email address is not public. Upload artwork photos from the same page; new artworks appear publicly as soon as they are saved. You can edit or delete your own artworks.

Uploads accept JPEG, PNG, or WebP images up to 5 MB.

## 3. Set up the first admin

1. Create the account that should be an administrator using **User login**.
2. In Supabase **SQL Editor**, run this query, replacing the email with the account's email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id
     from auth.users
     where lower(email) = lower('admin@example.com')
   );
   ```

3. Sign out of the website, then sign in using **Admin login**.

Once an admin is set up, the admin dashboard can change other accounts between user and admin roles. It cannot reveal passwords or delete authentication accounts; do those tasks in Supabase.

## 4. Use the admin dashboard

- **Artist profiles:** add, edit, or delete artist profiles.
- **Artworks:** add, edit, or delete gallery entries.
- **User accounts:** view registered account names and emails, and change their user/admin role. The currently signed-in admin cannot change their own role from the dashboard.

Admin-created gallery entries can use a relative image path (such as `images/portrait.jpg`) or an HTTPS image address. Users upload their own profile and artwork photos from their account page.

## 5. Run locally or deploy

For local testing, serve the folder over HTTP (for example, run `py -m http.server 8000` from this folder and open `http://localhost:8000`). Add that local origin to the Supabase Auth URL allowlist if using email confirmation.

For deployment, upload the project contents—including `index.html`, `app.js`, `supabase-config.js`, `default-profile.jfif`, and `supabase/setup.sql`—to your static host. On Vercel, use the folder containing `index.html` as the root, choose the **Other** preset, leave the build command empty, and deploy.
