# LinkedIn Publishing Setup

This guide walks through creating a LinkedIn Developer App and authorizing it so `npm run new-post` can post to your LinkedIn profile.

---

## Step 1: Create a LinkedIn App

1. Go to [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps/new)
2. Click **Create app**
3. Fill in:
   - **App name**: anything (e.g. `Francis Blog Publisher`)
   - **LinkedIn Page**: select your personal page or any page you admin (required by the form; will not affect where posts appear)
   - **App logo**: upload any image
4. Click **Create app**

---

## Step 2: Enable the required product

1. In your app, open the **Products** tab
2. Find **Share on LinkedIn** and click **Request access**
3. Agree to the terms — access is granted instantly

This enables the `w_member_social` scope, which allows posting on your behalf.

---

## Step 3: Configure OAuth redirect

1. Open the **Auth** tab of your app
2. Under **OAuth 2.0 settings → Authorized redirect URLs for your app**, add:
   ```
   http://localhost:3333/callback
   ```
3. Click **Update**

---

## Step 4: Copy credentials to `.env`

On the **Auth** tab, copy:

- **Client ID** → `LINKEDIN_CLIENT_ID`
- **Client Secret** → `LINKEDIN_CLIENT_SECRET`

Add them to your `.env` file:

```env
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

---

## Step 5: Authorize on first use

The next time you run `npm run new-post` and choose LinkedIn as a destination, the script will:

1. Open your browser to the LinkedIn authorization page
2. Ask you to log in (if not already) and grant permission
3. Redirect to `localhost:3333/callback` and capture the code automatically
4. Exchange the code for an access token
5. Save `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_PERSON_URN` to your `.env`

From then on, the stored token is reused. LinkedIn tokens last **60 days**. If publishing fails with an auth error, delete `LINKEDIN_ACCESS_TOKEN` from `.env` and the flow runs again on the next publish.

---

## Environment variables summary

| Key | Required | Description |
|-----|----------|-------------|
| `LINKEDIN_CLIENT_ID` | Setup only | Your LinkedIn app's Client ID |
| `LINKEDIN_CLIENT_SECRET` | Setup only | Your LinkedIn app's Client Secret |
| `LINKEDIN_ACCESS_TOKEN` | Auto-set | OAuth access token (written after first auth) |
| `LINKEDIN_PERSON_URN` | Auto-set | Your LinkedIn member URN (written after first auth) |
