/* Sends email through Resend (https://resend.com).
   Needs these environment variables on the live site:
     RESEND_API_KEY  your Resend API key
     MAIL_FROM       e.g.  goyslop.work <no-reply@goyslop.work>
   Without RESEND_API_KEY (e.g. running on your own PC) the email is printed
   in the terminal instead, so you can still see the sign-up code. */

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendMail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email not sent: no RESEND_API_KEY set]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return { dev: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text })
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  return res.json();
}

function sendCode(to, username, code, siteName) {
  const subject = `${code} is your ${siteName} code`;
  const text =
    `Your code to claim ${siteName}/${username} is: ${code}\n\n` +
    `Type it on the sign-up page. It expires in 15 minutes.\n` +
    `If you didn't try to sign up, you can ignore this email. No account is created without the code.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#07070b;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#101017;border:1px solid #2a2a35;border-radius:14px;padding:28px;color:#f4f4f5">
      <h1 style="font-size:20px;margin:0 0 12px">Your sign-up code</h1>
      <p style="color:#a1a1aa;line-height:1.5;margin:0 0 20px">
        Type this code on the sign-up page to claim <b style="color:#f4f4f5">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#16161f;border:1px solid #2a2a35;border-radius:12px;padding:16px 0;color:#ffffff">${esc(code)}</div>
      <p style="color:#71717a;font-size:12px;line-height:1.5;margin:22px 0 0">
        This code expires in 15 minutes. If you didn't try to sign up, ignore this email. No account is created without the code.
      </p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

function sendResetCode(to, username, code, siteName) {
  const subject = `${code} is your ${siteName} password reset code`;
  const text =
    `Someone asked to reset the password for ${siteName}/${username}.\n\n` +
    `Your code is: ${code}\n\nIt expires in 15 minutes. If this wasn't you, ignore this email and your password stays the same.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#07070b;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#101017;border:1px solid #2a2a35;border-radius:14px;padding:28px;color:#f4f4f5">
      <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
      <p style="color:#a1a1aa;line-height:1.5;margin:0 0 20px">
        Type this code on the sign-in page to choose a new password for <b style="color:#f4f4f5">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#16161f;border:1px solid #2a2a35;border-radius:12px;padding:16px 0;color:#ffffff">${esc(code)}</div>
      <p style="color:#71717a;font-size:12px;line-height:1.5;margin:22px 0 0">
        This code expires in 15 minutes. If you didn't ask for this, ignore this email and your password stays the same.
      </p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendCode, sendResetCode };
