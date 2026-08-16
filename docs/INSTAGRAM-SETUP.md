# Instagram Publishing Setup

Instagram publishing uses the **Meta (Facebook) Graph API**. You need a Facebook Page connected to an Instagram Business or Creator account, and a Meta Developer App.

---

## Prerequisites

- An Instagram account (Business or Creator)
- A Facebook Page linked to that Instagram account

If your Instagram is a personal account, convert it: **Instagram → Settings → Account → Switch to professional account**.

To link Instagram to a Facebook Page: **Facebook Page → Settings → Linked accounts → Instagram**.

---

## Step 1: Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com/apps/)
2. Click **Create app**
3. Choose **Other** as the use case, then **Business** as the app type
4. Fill in a name (e.g. `Francis Blog Publisher`) and click **Create app**

---

## Step 2: Add the Instagram product

1. In the app dashboard, find **Instagram** under **Add products to your app**
2. Click **Set up**
3. Under **Instagram → API setup with Instagram Business Login**, complete the setup

---

## Step 3: Add required permissions

In your app's **App Review → Permissions and Features**, ensure these are present (they are available without review for your own account in development mode):

- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`

---

## Step 4: Configure OAuth redirect

1. In the app dashboard, open **Facebook Login → Settings** (or **Use Cases → Authentication and account creation → Customize**)
2. Under **Valid OAuth Redirect URIs**, add:
   ```
   http://localhost:3333/callback
   ```
3. Save changes

---

## Step 5: Copy credentials to `.env`

From **App settings → Basic**, copy:

- **App ID** → `INSTAGRAM_APP_ID`
- **App secret** → `INSTAGRAM_APP_SECRET`

```env
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
```

---

## Step 6: Add yourself as a test user (development mode)

While your app is in development mode, only users added as testers can authorize it.

1. Go to **Roles → Test users** (or **App roles → Testers**)
2. Add your own Facebook account

---

## Step 7: Authorize on first use

The next time you run `npm run new-post` and choose Instagram, the script will:

1. Open your browser to the Facebook authorization dialog
2. Ask you to grant the required permissions
3. Redirect to `localhost:3333/callback` and capture the code
4. Exchange the code for a long-lived token (~60 days)
5. Discover your Instagram Business Account ID via the connected Facebook Page
6. Save `FACEBOOK_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID` to your `.env`

On subsequent runs the stored credentials are reused. When the token expires, delete `FACEBOOK_ACCESS_TOKEN` from `.env` and re-run.

---

## Image requirement

Instagram requires an image on every post. If no image is selected or generated during the review loop, the Instagram publish step is skipped. The image URL must be publicly accessible — both Unsplash photos and DALL-E generated images satisfy this requirement.

---

## Environment variables summary

| Key | Required | Description |
|-----|----------|-------------|
| `INSTAGRAM_APP_ID` | Setup only | Your Meta app's App ID |
| `INSTAGRAM_APP_SECRET` | Setup only | Your Meta app's App Secret |
| `FACEBOOK_ACCESS_TOKEN` | Auto-set | Long-lived user token (written after first auth) |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | Auto-set | Your IG Business/Creator account ID (auto-discovered) |
