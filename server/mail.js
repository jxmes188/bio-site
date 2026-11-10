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
  <div style="font-family:Arial,Helvetica,sans-serif;background:#000000;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#0a0a0a;border:1px solid #262626;border-radius:14px;padding:28px;color:#fafafa">
      <h1 style="font-size:20px;margin:0 0 12px">Your sign-up code</h1>
      <p style="color:#a3a3a3;line-height:1.5;margin:0 0 20px">
        Type this code on the sign-up page to claim <b style="color:#fafafa">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#141414;border:1px solid #262626;border-radius:12px;padding:16px 0;color:#ffffff">${esc(code)}</div>
      <p style="color:#737373;font-size:12px;line-height:1.5;margin:22px 0 0">
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
  <div style="font-family:Arial,Helvetica,sans-serif;background:#000000;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#0a0a0a;border:1px solid #262626;border-radius:14px;padding:28px;color:#fafafa">
      <h1 style="font-size:20px;margin:0 0 12px">Reset your password</h1>
      <p style="color:#a3a3a3;line-height:1.5;margin:0 0 20px">
        Type this code on the sign-in page to choose a new password for <b style="color:#fafafa">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#141414;border:1px solid #262626;border-radius:12px;padding:16px 0;color:#ffffff">${esc(code)}</div>
      <p style="color:#737373;font-size:12px;line-height:1.5;margin:22px 0 0">
        This code expires in 15 minutes. If you didn't ask for this, ignore this email and your password stays the same.
      </p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

function sendMagic(to, username, code, link, siteName) {
  const subject = `${code} is your ${siteName} sign-in code`;
  const text =
    `Sign in to ${siteName}/${username}\n\n` +
    `Your code is: ${code}\n\nOr open this link on the same device:\n${link}\n\n` +
    `Both expire in 15 minutes and work once. If you didn't ask for this, ignore this email.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#000000;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#0a0a0a;border:1px solid #262626;border-radius:14px;padding:28px;color:#fafafa">
      <h1 style="font-size:20px;margin:0 0 12px">Sign in</h1>
      <p style="color:#a3a3a3;line-height:1.5;margin:0 0 20px">
        Use this code to sign in to <b style="color:#fafafa">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <div style="font-size:34px;font-weight:bold;letter-spacing:10px;text-align:center;background:#141414;border:1px solid #262626;border-radius:12px;padding:16px 0;color:#ffffff">${esc(code)}</div>
      <p style="text-align:center;margin:22px 0 0">
        <a href="${esc(link)}" style="display:inline-block;background:#fafafa;color:#0a0a0a;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Sign in with one click</a>
      </p>
      <p style="color:#737373;font-size:12px;line-height:1.5;margin:22px 0 0">
        The code and link expire in 15 minutes and work once. If you didn't ask for this, ignore this email.
      </p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendCode, sendResetCode, sendMagic };
