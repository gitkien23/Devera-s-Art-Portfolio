# De Vera's Art Portfolio

The site has a static public gallery plus Supabase email/password sign-in. User accounts and their profile details are stored in the connected Supabase project. Gallery entries are still static in `app.js`; signing in does not add or edit gallery content.

## 1. Configure Supabase

1. In Supabase, open **Project Settings → API**.
2. Confirm `supabase-config.js` contains your project's **Project URL** and **publishable/anon key**. Use the base project URL (for example, `https://your-project.supabase.co`), not a URL ending in `/rest/v1`. These browser values are public. Never put a `service_role` key or password in the site.
3. In **SQL Editor**, run the entire `supabase/setup.sql` file once. It creates the profile table and signup trigger, stores the default profile picture path, and allows each signed-in user to read only their own profile.
4. In **Authentication → Sign In / Providers**, enable email/password sign-in. Choose whether users must confirm their email.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed site. Add any local and preview origins you use to the redirect URL allowlist.

Keep `default-profile.jfif` beside `index.html`; each new account profile uses it by default.

## 2. Create and sign in as a user

1. Open the site and click **User login**.
2. Choose **Create a user account**. The name defaults to `Family Artist`; change it if you want, then enter the user's email and choose a password.
3. If email confirmation is enabled, confirm the email using the message Supabase sends.
4. Click **User login** and sign in with that email and password.

There is no pre-created account or default password. Create accounts through the form; do not hard-code or share passwords.

## 3. Give an account admin access

1. Create and confirm the account that should be an administrator using **User login**.
2. In the Supabase **SQL Editor**, replace `admin@example.com` below with that account's email and run the query:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (
     select id
     from auth.users
     where lower(email) = lower('admin@example.com')
   );
   ```

3. Sign out, then use **Admin login** with that account's email and password. Regular user accounts are rejected by the admin login.

Only a project owner should promote an account. The admin screen currently confirms admin access; it does not include gallery editing or review tools.

## 4. Add gallery entries

Edit the `artists` and `artworks` arrays near the top of `app.js`. Use relative image paths, such as `images/portrait.jpg`, and keep those image files in this project folder.

## 5. Run locally or deploy

For local testing, serve the folder at an HTTP origin (for example, run `py -m http.server 8000` from this folder and open `http://localhost:8000`). Add that local origin to the Auth URL allowlist if using email confirmation.

For deployment, upload the project contents—including `index.html`, `app.js`, `supabase-config.js`, `default-profile.jfif`, and `supabase/setup.sql`—to your static host. On Vercel, use the folder containing `index.html` as the root, choose the **Other** preset, and leave the build command empty. Redeploy after changing files.
