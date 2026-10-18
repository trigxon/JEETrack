# Security Policy

JEE ADV OSINT handles real user accounts and payment data (via Supabase Auth
and Razorpay), so we take security reports seriously and appreciate
responsible disclosure.

## Reporting a vulnerability

If you find a security issue in JEE ADV OSINT (auth bypass, data exposure,
payment/webhook forgery, injection, etc.), please **do not open a public
GitHub issue**. Instead, email **security@jee-adv-osint.vercel.app** with:

- A description of the issue and its potential impact
- Steps to reproduce (a minimal repro is ideal)
- Any relevant logs, requests, or screenshots

We'll acknowledge your report as soon as possible and keep you updated
as we investigate and fix it. Please give us a reasonable amount of time
to address the issue before any public disclosure.

## Scope

This covers the JEE ADV OSINT web app (jee-adv-osint.vercel.app), its Vercel serverless
functions, and its Supabase backend (database, RPCs, edge functions).
Third-party services we depend on (Supabase, Vercel, Razorpay, Groq,
Resend, PostHog) should be reported directly to those providers.
