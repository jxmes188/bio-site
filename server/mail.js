/* Sends email through Resend (https://resend.com).
   Needs these environment variables on the live site:
     RESEND_API_KEY  your Resend API key
     MAIL_FROM       e.g.  goyslop.work <no-reply@goyslop.work>
   Without RESEND_API_KEY (e.g. running on your own PC) the email is printed
   in the terminal instead, so you can still click the confirmation link. */

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

function sendVerification(to, username, link, siteName) {
  const subject = `Confirm your email for ${siteName}/${username}`;
  const text =
    `Hi ${username},\n\nConfirm your email to publish your page ${siteName}/${username}:\n${link}\n\n` +
    `This link expires in 24 hours. If you didn't sign up, ignore this email and the account will be deleted.`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#07070b;padding:32px 16px">
    <div style="max-width:440px;margin:0 auto;background:#101017;border:1px solid #2a2a35;border-radius:14px;padding:28px;color:#f4f4f5">
      <h1 style="font-size:20px;margin:0 0 12px">Confirm your email</h1>
      <p style="color:#a1a1aa;line-height:1.5;margin:0 0 22px">
        Hi <b style="color:#f4f4f5">${esc(username)}</b>, click the button to confirm your email and publish
        <b style="color:#f4f4f5">${esc(siteName)}/${esc(username)}</b>.
      </p>
      <a href="${esc(link)}" style="display:inline-block;background:#a855f7;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Confirm email</a>
      <p style="color:#71717a;font-size:12px;line-height:1.5;margin:22px 0 0">
        This link expires in 24 hours. If you didn't sign up, ignore this email and the account will be deleted.
      </p>
    </div>
  </div>`;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendMail, sendVerification };
