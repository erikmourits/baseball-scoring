# Setup Guide

Follow these steps in order to get the app running locally and deployed to baseball.mourits.nu.

---

## 1. Copy files into your GitHub repo

Open VS Code, then open a terminal (Terminal → New Terminal) and run:

```bash
# Clone your repo
git clone https://github.com/erikmourits/baseball-scoring.git
cd baseball-scoring
```

Copy all the files from this project folder into the cloned repo folder, then:

```bash
npm install
```

---

## 2. Configure Supabase

1. Go to [supabase.com](https://supabase.com) and open your project
2. Click **SQL editor** in the left sidebar
3. Paste the contents of `supabase/schema.sql` and click **Run**
4. Go to **Project Settings → API**
5. Copy the **Project URL** and **anon public** key

Create a `.env` file in the project root (copy from `.env.example`):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

---


## 2b. Option B: Run Fully Locally (no remote Supabase)

Skip this section if you are using a hosted Supabase project (Option A above).

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) must be running, plus the Supabase CLI:

```bash
npm install -g supabase
```

**1. Start the local stack:**

```bash
npm run supabase:start
```

This prints a block of local credentials including the **anon key**. Copy it.

**2. Create `.env.localdev`** in the project root (never committed):

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<paste the anon key from step 1>
VITE_APP_VERSION=0.0.0-local
SUPABASE_PROJECT_REF=local
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Migrations are applied automatically on first start. To reset the database from scratch:

```bash
npm run supabase:reset
```

**3. (Optional) Enable scorecard OCR locally**

Create `supabase/functions/.env` (gitignored):

```dotenv
OPENAI_API_KEY=sk-...your-key-here...
```

**4. Run the app:**

```bash
npm run dev
```

Vite picks up `.env.localdev` automatically. Supabase Studio is available at [http://127.0.0.1:54323](http://127.0.0.1:54323).

To serve Edge Functions locally in a second terminal:

```bash
npm run serve-functions
```

---

## 3. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) — you should see the login screen.

---

## 4. Set up your server

SSH into your server and run:

```bash
# Install Nginx (if not already installed)
sudo apt update && sudo apt install -y nginx

# Create the web root
sudo mkdir -p /var/www/baseball-scoring

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx
```

Copy the Nginx config to your server:

```bash
sudo cp nginx/baseball.mourits.nu.conf /etc/nginx/sites-available/baseball.mourits.nu
sudo ln -s /etc/nginx/sites-available/baseball.mourits.nu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Add the DNS A record first** (at your DNS provider):
- Type: `A`
- Name: `baseball`
- Value: your server's IP address

Wait a few minutes for DNS to propagate, then get the SSL certificate:

```bash
sudo certbot --nginx -d baseball.mourits.nu
```

---

## 5. Set up GitHub Actions (auto-deploy)

In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add:

| Secret name           | Value                                          |
|-----------------------|------------------------------------------------|
| `VITE_SUPABASE_URL`   | Your Supabase project URL                      |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key                      |
| `REMOTE_HOST`         | Your server's IP address or hostname           |
| `REMOTE_USER`         | SSH username (e.g. `ubuntu`, `root`, `deploy`) |
| `SSH_PRIVATE_KEY`     | Your SSH private key (contents of `~/.ssh/id_rsa`) |

To generate a deployment SSH key (run on your local machine):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/baseball_deploy
# Add the PUBLIC key to your server:
ssh-copy-id -i ~/.ssh/baseball_deploy.pub your-user@your-server-ip
# Use the PRIVATE key contents as the SSH_PRIVATE_KEY secret
cat ~/.ssh/baseball_deploy
```

---

## 6. Deploy

Push to main and GitHub Actions will build and deploy automatically:

```bash
git add .
git commit -m "Initial scaffold"
git push origin main
```

Go to **Actions** tab in your GitHub repo to watch the deployment. Once green, visit [https://baseball.mourits.nu](https://baseball.mourits.nu).

---

