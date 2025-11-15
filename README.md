# ReassureMe
**Smart support for everyday health.**

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

## 📝 Overview

**ReassureMe** is a web application designed to offer **smart, data-driven support** and reassurance related to everyday health and wellness concerns.

This platform aims to provide users with a clean, intuitive interface to log, track, and receive helpful insights related to their personal health data, powered by a robust backend.

## ✨ Features (Hypothesized)

* **Secure Authentication:** User sign-up and sign-in powered by Supabase Auth.
* **Data Logging:** Easily record and track key health metrics or anxiety events.
* **Data Visualization:** Interactive charts and graphs to visualize progress and patterns over time.
* **Reassurance Engine:** Provides relevant and personalized summaries or data points to offer comfort or context.
* **Responsive Design:** A beautiful and accessible interface built with Tailwind CSS.

## 🛠️ Tech Stack

This project is built using the following technologies:

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend** | [**Vite**](https://vitejs.dev/) | Next-generation frontend tooling and build system. |
| **Language** | [**TypeScript**](https://www.typescriptlang.org/) | Strongly-typed JavaScript for better developer experience and fewer errors. |
| **Styling** | [**Tailwind CSS**](https://tailwindcss.com/) | A utility-first CSS framework for rapid UI development. |
| **Backend/DB** | [**Supabase**](https://supabase.com/) | Open-source Firebase alternative (Postgres database, Auth, Storage). |
| **Deployment** | [**Vercel**](https://vercel.com/) | Platform for frontend hosting and serverless functions. |

## 🚀 Getting Started

Follow these steps to set up the project locally.

### Prerequisites

You will need the following installed on your machine:

* Node.js (LTS recommended)
* npm (or yarn/pnpm)

### 1. Clone the Repository

```bash
git clone [https://github.com/ethanolchik/ReassureMe.git](https://github.com/ethanolchik/ReassureMe.git)
cd ReassureMe
```
### 2. Install dependencies
```bash
npm install
# or yarn install
# or pnpm install
```
### Setup Environment Variables

The application requires environment variables for connecting to Supabase. Create a file named .env in the root directory and add the following:
```env
VITE_SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL"
VITE_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```
### 4. Database Setup
This project uses Supabase and includes migration files in the supabase/migrations folder.

Set up the Supabase CLI:

```bash
npm install -g supabase
```
Link your local project to your Supabase project:

```bash
supabase link --project-ref your-project-id
```
Apply the migrations to your remote database:

```bash
supabase db push
```
5. Run the Development Server
Start the application in development mode:
```bash
npm run dev
```
The application should now be running at http://localhost:5173 (or the address shown in your terminal).

## 🚢 Deployment
The presence of a vercel.json file indicates this project is configured for deployment on Vercel.

Connect your GitHub repository to your Vercel account.

Ensure your Supabase environment variables are configured in Vercel's project settings.

Vercel will automatically build and deploy the application on every push to the main branch
