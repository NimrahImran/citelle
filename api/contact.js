// POST /api/contact  { name, email, service, message, website (honeypot) }
// Sends the message to the owner's inbox through Gmail (App Password in environment variables).
import nodemailer from 'nodemailer';
import { send, readJson, rateLimited, onlyMethod } from './_lib/http.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function validateContact(b) {
  const name = String(b?.name || '').trim();
  const email = String(b?.email || '').trim();
  const message = String(b?.message || '').trim();
  const service = String(b?.service || '').trim().slice(0, 80);
  if (name.length < 2 || name.length > 80) return { error: 'Enter your name.' };
  if (!EMAIL.test(email) || email.length > 120) return { error: 'Enter a valid email address.' };
  if (message.length < 10 || message.length > 4000) return { error: 'Write a message of at least 10 characters.' };
  return { name, email, message, service };
}

export default async function handler(req, res) {
  if (!onlyMethod(req, res, 'POST')) return;
  if (rateLimited(req, 'contact', 5, 10 * 60_000)) return send(res, 429, { error: 'Too many messages. Please try again later.' });
  let body;
  try { body = await readJson(req, 20_000); } catch { return send(res, 400, { error: 'Invalid request.' }); }
  if (body?.website) return send(res, 200, { ok: true }); // bot filled the hidden field
  const v = validateContact(body);
  if (v.error) return send(res, 400, { error: v.error });

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return send(res, 503, { error: 'The contact form is not configured yet.' });

  try {
    const transport = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: pass.replace(/\s+/g, '') } });
    await transport.sendMail({
      from: `"Citelle contact form" <${user}>`,
      to: process.env.CONTACT_TO || user,
      replyTo: `"${v.name.replace(/"/g, '')}" <${v.email}>`,
      subject: `Citelle: new message from ${v.name}${v.service ? ` (${v.service})` : ''}`,
      text: `Name: ${v.name}\nEmail: ${v.email}\nService: ${v.service || '-'}\n\n${v.message}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px">
<h2 style="color:#22212A;margin:0 0 12px">New message from Citelle</h2>
<p><b>Name:</b> ${esc(v.name)}<br><b>Email:</b> ${esc(v.email)}<br><b>Service:</b> ${esc(v.service || '-')}</p>
<div style="padding:14px 16px;background:#F3EFE8;border-left:4px solid #C8B6E2;white-space:pre-wrap">${esc(v.message)}</div>
<p style="color:#7A748A;font-size:12px">Reply to this email to answer ${esc(v.name)} directly.</p></div>`,
    });
    return send(res, 200, { ok: true });
  } catch {
    return send(res, 502, { error: 'Your message could not be sent right now. Please try again.' });
  }
}
