# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/506bc66e-4a31-45f6-acf9-1b2c307eeb19

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/506bc66e-4a31-45f6-acf9-1b2c307eeb19) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/506bc66e-4a31-45f6-acf9-1b2c307eeb19) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## Supabase setup

Draft persistence, uploads, and authentication flows rely on Supabase. Make sure these environment variables are defined in your `.env.local` before running the app:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The Creation page now saves drafts locally and queues Supabase upserts after every edit/move/add action. Remote writes are debounced so that editing stays fluid, but a manual **Salvar rascunho** or navigation to the finalize step will flush immediately.

Auto-saved drafts that were never confirmed via **Salvar rascunho** remain ephemeral: once you close Creation they start a five-minute countdown that surfaces in the Create page. Click the timer pill to keep the draft permanently; otherwise it will be deleted automatically when the countdown hits zero to keep Supabase tidy.
